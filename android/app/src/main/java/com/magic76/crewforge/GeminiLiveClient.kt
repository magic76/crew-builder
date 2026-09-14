package com.magic76.crewforge

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class GeminiLiveClient(private val onEvent: (String) -> Unit) {
    companion object {
        private const val TAG = "CrewForgeLive"
        private const val MODEL = "models/gemini-3.1-flash-live-preview"
        private const val URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key="
        private const val SETUP_TIMEOUT_MS = 15_000L
        private const val PLAYBACK_TAIL_GUARD_MS = 450L
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    @Volatile private var socket: WebSocket? = null
    @Volatile private var recording = false
    @Volatile private var setupComplete = false
    @Volatile private var aiSpeaking = false
    @Volatile private var resumeMicAt = 0L
    private var recorder: AudioRecord? = null
    private var track: AudioTrack? = null

    fun start(apiKey: String, appContext: String) {
        stop()
        setupComplete = false
        aiSpeaking = false
        resumeMicAt = 0L
        emit("connecting", "Opening Gemini Live connection")
        val request = Request.Builder().url(URL + apiKey.trim()).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket opened; sending setup")
                emit("connecting", "WebSocket open · sending setup")
                val setup = JSONObject().apply {
                    put("model", MODEL)
                    put("generationConfig", JSONObject().apply {
                        put("responseModalities", JSONArray().put("AUDIO"))
                        put("speechConfig", JSONObject().put("voiceConfig", JSONObject().put("prebuiltVoiceConfig", JSONObject().put("voiceName", "Aoede"))))
                    })
                    put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", systemPrompt(appContext)))))
                    put("tools", JSONArray().put(JSONObject().put("functionDeclarations", JSONArray()
                        .put(function("inspect_app", "Read the current mini app's visible controls and state. Call this before claiming the app has no usable action.", JSONObject().apply {
                            put("type", "OBJECT")
                            put("properties", JSONObject())
                        }))
                        .put(function("app_action", "Operate the currently visible mini app. Use an action exposed by the app.", JSONObject().apply {
                            put("type", "OBJECT")
                            put("properties", JSONObject().apply {
                                put("name", JSONObject().put("type", "STRING"))
                                put("args_json", JSONObject().put("type", "STRING"))
                            })
                            put("required", JSONArray().put("name"))
                        }))
                        .put(function("modify_app", "Request a structural or visual change to the current mini app. Do not use for ordinary app operation.", JSONObject().apply {
                            put("type", "OBJECT")
                            put("properties", JSONObject().put("request", JSONObject().put("type", "STRING")))
                            put("required", JSONArray().put("request"))
                        })))))
                }
                if (!webSocket.send(JSONObject().put("setup", setup).toString())) {
                    emit("error", "Could not send Gemini Live setup")
                    webSocket.cancel()
                    return
                }
                emit("connecting", "Setup sent · waiting for Gemini")
                thread(name = "forge-live-setup-timeout", isDaemon = true) {
                    Thread.sleep(SETUP_TIMEOUT_MS)
                    if (socket === webSocket && !setupComplete) {
                        emit("error", "Gemini Live setup timed out")
                        webSocket.cancel()
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) = handle(text)
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) = handle(bytes.utf8())

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                val detail = response?.let { "HTTP ${it.code}: ${it.message}" }
                Log.e(TAG, "WebSocket failure: ${detail ?: t.message ?: t.javaClass.simpleName}", t)
                emit("error", detail ?: t.message ?: "Live connection failed")
                stopAudio()
                if (socket === webSocket) socket = null
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WebSocket closed: code=$code reason=${reason.ifBlank { "none" }}")
                stopAudio()
                if (socket === webSocket) socket = null
                emit("stopped", "Live closed ($code${if (reason.isNotBlank()) ": $reason" else ""})")
            }
        })
    }

    fun stop() {
        setupComplete = false
        aiSpeaking = false
        resumeMicAt = 0L
        recording = false
        stopAudio()
        socket?.close(1000, "user stopped")
        socket = null
    }

    fun toolResponse(callId: String, name: String, resultJson: String) {
        val response = try { JSONObject(resultJson) } catch (_: Exception) { JSONObject().put("result", resultJson) }
        val item = JSONObject().put("id", callId).put("name", name).put("response", response)
        socket?.send(JSONObject().put("toolResponse", JSONObject().put("functionResponses", JSONArray().put(item))).toString())
    }

    private fun handle(text: String) {
        try {
            val root = JSONObject(text)
            if (root.has("setupComplete") || root.has("setup_complete")) {
                setupComplete = true
                emit("ready", "Gemini Live ready · listening")
                startRecording()
                return
            }

            val toolCall = root.optJSONObject("toolCall") ?: root.optJSONObject("tool_call")
            val calls = toolCall?.optJSONArray("functionCalls") ?: toolCall?.optJSONArray("function_calls")
            if (calls != null) {
                for (i in 0 until calls.length()) {
                    val call = calls.optJSONObject(i) ?: continue
                    emitTool(call.optString("id"), call.optString("name"), call.optJSONObject("args") ?: JSONObject())
                }
            }

            val server = root.optJSONObject("serverContent") ?: root.optJSONObject("server_content") ?: return
            val turn = server.optJSONObject("modelTurn") ?: server.optJSONObject("model_turn")
            val parts = turn?.optJSONArray("parts")
            if (parts != null) {
                for (i in 0 until parts.length()) {
                    val inline = parts.optJSONObject(i)?.optJSONObject("inlineData") ?: parts.optJSONObject(i)?.optJSONObject("inline_data") ?: continue
                    val mime = inline.optString("mimeType", inline.optString("mime_type"))
                    if (mime.contains("audio") || mime.contains("pcm")) {
                        aiSpeaking = true
                        resumeMicAt = Long.MAX_VALUE
                        play(Base64.decode(inline.optString("data"), Base64.DEFAULT))
                    }
                }
            }

            val turnComplete = server.optBoolean("turnComplete", server.optBoolean("turn_complete", false))
            if (turnComplete) {
                aiSpeaking = false
                resumeMicAt = System.currentTimeMillis() + PLAYBACK_TAIL_GUARD_MS
                emit("ready", "Listening")
            }

            if (server.optBoolean("interrupted", false)) {
                aiSpeaking = false
                resumeMicAt = System.currentTimeMillis() + PLAYBACK_TAIL_GUARD_MS
                flushOutput()
            }
        } catch (error: Exception) {
            Log.e(TAG, "Failed to handle Live server message", error)
        }
    }

    private fun startRecording() {
        if (recording) return
        val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (min <= 0) {
            Log.e(TAG, "Microphone buffer size unavailable: $min")
            emit("error", "Microphone is unavailable")
            return
        }

        val record = try {
            AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 3200))
        } catch (error: Exception) {
            Log.e(TAG, "Microphone initialization failed", error)
            emit("error", "Microphone could not start")
            return
        }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "Microphone is not initialized: state=${record.state}")
            record.release()
            emit("error", "Microphone could not start")
            return
        }

        recorder = record
        recording = true
        try {
            record.startRecording()
        } catch (error: Exception) {
            Log.e(TAG, "Microphone start failed", error)
            recording = false
            recorder = null
            record.release()
            emit("error", "Microphone could not start")
            return
        }

        if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
            Log.e(TAG, "Microphone did not enter recording state: state=${record.recordingState}")
            recording = false
            recorder = null
            record.release()
            emit("error", "Microphone could not start")
            return
        }

        Log.i(TAG, "Microphone recording started")
        thread(name = "forge-live-mic", isDaemon = true) {
            val buffer = ByteArray(3200)
            while (recording) {
                val count = try { record.read(buffer, 0, buffer.size) } catch (_: Exception) { -1 }
                if (count > 0) {
                    if (aiSpeaking || System.currentTimeMillis() < resumeMicAt) continue

                    val data = Base64.encodeToString(buffer.copyOf(count), Base64.NO_WRAP)
                    val audio = JSONObject().put("mimeType", "audio/pcm;rate=16000").put("data", data)
                    if (socket?.send(JSONObject().put("realtimeInput", JSONObject().put("audio", audio)).toString()) == false) {
                        Log.w(TAG, "Live socket rejected an audio chunk")
                    }
                } else if (count < 0) {
                    Log.e(TAG, "Microphone read failed: $count")
                    recording = false
                }
            }
            Log.i(TAG, "Microphone recording stopped")
        }
    }

    private fun play(pcm: ByteArray) {
        if (pcm.isEmpty()) return
        var output = track
        if (output == null) {
            val min = AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            output = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(24000).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(maxOf(min, 24000))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            output.play()
            track = output
            Log.i(TAG, "Audio playback started")
        }
        output.write(pcm, 0, pcm.size)
    }

    private fun flushOutput() {
        try {
            track?.pause()
            track?.flush()
            track?.play()
        } catch (_: Exception) {}
    }

    private fun stopAudio() {
        recording = false
        aiSpeaking = false
        resumeMicAt = 0L
        try { recorder?.stop() } catch (_: Exception) {}
        try { recorder?.release() } catch (_: Exception) {}
        recorder = null
        try { track?.stop() } catch (_: Exception) {}
        try { track?.release() } catch (_: Exception) {}
        track = null
    }

    private fun function(name: String, description: String, parameters: JSONObject) =
        JSONObject().put("name", name).put("description", description).put("parameters", parameters)

    private fun emit(state: String, message: String? = null) =
        onEvent(JSONObject().put("type", "state").put("state", state).put("message", message ?: JSONObject.NULL).toString())

    private fun emitTool(id: String, name: String, args: JSONObject) =
        onEvent(JSONObject().put("type", "tool").put("id", id).put("name", name).put("args", args).toString())

    private fun systemPrompt(context: String): String {
        val root = try { JSONObject(context) } catch (_: Exception) { JSONObject() }
        val live = root.optJSONObject("live") ?: JSONObject()
        val style = live.optString("style", "concise")
        val language = live.optString("language", "auto")

        val styleInstruction = when (style) {
            "detailed" -> "Give clear, useful context and explanation, but remain conversational."
            "balanced" -> "Be natural and moderately concise. Explain only what is useful."
            else -> "Be very concise and direct. Prefer one short sentence unless more is necessary."
        }
        val languageInstruction = when (language) {
            "zh-TW" -> "Always respond in Traditional Chinese (Taiwan)."
            "en" -> "Always respond in English."
            "ja" -> "Always respond in Japanese."
            else -> "Respond in the language the user is currently speaking."
        }

        return """
You are the live voice companion inside Crew Builder. The user is currently using a generated mini app.
$styleInstruction
$languageInstruction
Finish your entire spoken response before listening for the next user request. Never shorten or abort a response because of speaker echo, ambient noise, or your own playback.
For ordinary operations, use app_action with an action exposed by the current app.
If CURRENT APP CONTEXT has no actions, looks stale, or you are unsure whether a requested operation exists, call inspect_app first. Never claim the app has no usable tools before calling inspect_app.
The generic actions click, set_input, and page_state are valid runtime capabilities even when the generated app did not explicitly register custom actions.
For visual or structural changes, call modify_app. Do not pretend an action succeeded before the tool result returns.

CURRENT APP CONTEXT:
$context
""".trimIndent()
    }
}
