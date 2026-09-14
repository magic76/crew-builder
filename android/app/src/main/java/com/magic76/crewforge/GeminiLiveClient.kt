package com.magic76.crewforge

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Base64
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
        private const val MODEL = "models/gemini-3.1-flash-live-preview"
        private const val URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key="
    }

    private val client = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).pingInterval(10, TimeUnit.SECONDS).build()
    @Volatile private var socket: WebSocket? = null
    @Volatile private var recording = false
    private var recorder: AudioRecord? = null
    private var track: AudioTrack? = null

    fun start(apiKey: String, appContext: String) {
        stop()
        emit("connecting")
        val request = Request.Builder().url(URL + apiKey.trim()).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val setup = JSONObject().apply {
                    put("model", MODEL)
                    put("generationConfig", JSONObject().apply {
                        put("responseModalities", JSONArray().put("AUDIO"))
                        put("speechConfig", JSONObject().put("voiceConfig", JSONObject().put("prebuiltVoiceConfig", JSONObject().put("voiceName", "Aoede"))))
                    })
                    put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", systemPrompt(appContext)))))
                    put("tools", JSONArray().put(JSONObject().put("functionDeclarations", JSONArray()
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
                webSocket.send(JSONObject().put("setup", setup).toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) = handle(text)
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) = handle(bytes.utf8())
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                emit("error", t.message ?: "Live connection failed")
                stopAudio()
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                stopAudio(); emit("stopped")
            }
        })
    }

    fun stop() {
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
                emit("ready")
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
            if (parts != null) for (i in 0 until parts.length()) {
                val inline = parts.optJSONObject(i)?.optJSONObject("inlineData") ?: parts.optJSONObject(i)?.optJSONObject("inline_data") ?: continue
                val mime = inline.optString("mimeType", inline.optString("mime_type"))
                if (mime.contains("audio") || mime.contains("pcm")) play(Base64.decode(inline.optString("data"), Base64.DEFAULT))
            }
            if (server.optBoolean("interrupted", false)) flushOutput()
        } catch (_: Exception) {}
    }

    private fun startRecording() {
        if (recording) return
        val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val record = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 3200))
        recorder = record
        recording = true
        record.startRecording()
        thread(name = "forge-live-mic", isDaemon = true) {
            val buffer = ByteArray(3200)
            while (recording) {
                val count = try { record.read(buffer, 0, buffer.size) } catch (_: Exception) { -1 }
                if (count > 0) {
                    val data = Base64.encodeToString(buffer.copyOf(count), Base64.NO_WRAP)
                    val blob = JSONObject().put("mimeType", "audio/pcm;rate=16000").put("data", data)
                    socket?.send(JSONObject().put("realtimeInput", JSONObject().put("mediaChunks", JSONArray().put(blob))).toString())
                }
            }
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
                .setBufferSizeInBytes(maxOf(min, 24000)).setTransferMode(AudioTrack.MODE_STREAM).build()
            output.play(); track = output
        }
        output.write(pcm, 0, pcm.size)
    }

    private fun flushOutput() { try { track?.pause(); track?.flush(); track?.play() } catch (_: Exception) {} }
    private fun stopAudio() {
        recording = false
        try { recorder?.stop() } catch (_: Exception) {}
        try { recorder?.release() } catch (_: Exception) {}
        recorder = null
        try { track?.stop() } catch (_: Exception) {}
        try { track?.release() } catch (_: Exception) {}
        track = null
    }

    private fun function(name: String, description: String, parameters: JSONObject) = JSONObject().put("name", name).put("description", description).put("parameters", parameters)
    private fun emit(state: String, message: String? = null) = onEvent(JSONObject().put("type", "state").put("state", state).put("message", message ?: JSONObject.NULL).toString())
    private fun emitTool(id: String, name: String, args: JSONObject) = onEvent(JSONObject().put("type", "tool").put("id", id).put("name", name).put("args", args).toString())

    private fun systemPrompt(context: String) = """
You are the live voice companion inside Crew Forge. The user is currently using a generated mini app.
Be concise, conversational, and useful. Speak in the user's language.
For ordinary operations, call app_action using one of the exposed actions in CURRENT APP CONTEXT.
For visual/structural changes, call modify_app. Do not pretend an action succeeded before the tool result returns.
If the app does not expose a suitable action, explain briefly or use modify_app to add the capability when appropriate.

CURRENT APP CONTEXT:
$context
""".trimIndent()
}
