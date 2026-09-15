package com.crewpocket.crewbuilder

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class ForgeNativeBridge(private val activity: Activity, private val onGeminiResult:(String)->Unit, private val onLiveEvent:(String)->Unit) {
 companion object { private const val TAG="CrewBuilder"; private const val PREFS="crew_builder_config"; private const val LEGACY_PREFS="crew_forge_config"; private const val KEY_API_KEY="gemini_api_key"; private const val KEY_ALIAS="crew_builder_gemini_key"; private const val ENCRYPTED_PREFIX="enc:"; private const val MIC_REQUEST=701; private val FALLBACK_MODELS=listOf("gemini-3.6-flash","gemini-3.5-flash-lite","gemini-3.5-flash","gemini-3.0-flash","gemini-3-flash","gemini-2.5-flash","gemini-2.0-flash","gemini-1.5-flash") }
 private class GeminiHttpException(val statusCode:Int,detail:String):IllegalStateException("HTTP $statusCode $detail")
 private val executor=Executors.newCachedThreadPool(); private val httpClient=OkHttpClient.Builder().connectTimeout(20,TimeUnit.SECONDS).readTimeout(35,TimeUnit.SECONDS).build(); private val live=GeminiLiveClient(onLiveEvent)
 init{migratePreferences()}
 @JavascriptInterface fun hasGeminiApiKey()=getApiKey().isNotBlank()
 @JavascriptInterface fun setGeminiApiKey(key:String?){val v=key.orEmpty().trim();if(v.isBlank())prefs().edit().remove(KEY_API_KEY).apply() else prefs().edit().putString(KEY_API_KEY,encrypt(v)).apply()}
 @JavascriptInterface fun clearGeminiApiKey(){prefs().edit().remove(KEY_API_KEY).apply()}
 @JavascriptInterface fun startGeminiLive(appContext:String?){val key=getApiKey();if(key.isBlank()){onLiveEvent(JSONObject().put("type","state").put("state","error").put("message","Gemini API key is missing").toString());return};if(Build.VERSION.SDK_INT>=23&&activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){activity.runOnUiThread{activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),MIC_REQUEST)};onLiveEvent(JSONObject().put("type","state").put("state","permission").put("message","Allow microphone access, then tap Live again").toString());return};live.start(key,appContext.orEmpty())}
 @JavascriptInterface fun stopGeminiLive()=live.stop(); @JavascriptInterface fun respondGeminiLive(callId:String,name:String,resultJson:String)=live.toolResponse(callId,name,resultJson)
 @JavascriptInterface fun generateGemini(requestId:String,prompt:String,preferredModel:String?){executor.execute{val apiKey=getApiKey();if(apiKey.isBlank()){deliver(requestId,null,null,"Gemini API key is missing");return@execute};val models=mutableListOf<String>();val requested=preferredModel.orEmpty().trim();if(requested.isNotEmpty()&&requested!="auto")models.add(requested);FALLBACK_MODELS.forEach{if(!models.contains(it))models.add(it)};val failures=mutableListOf<String>();for(model in models){try{val text=callGemini(apiKey,model,prompt);if(text.isNotBlank()){deliver(requestId,text,model,null);return@execute};failures.add("$model returned an empty response")}catch(e:Exception){val d="$model: ${compactError(e.message?:e.javaClass.simpleName)}";failures.add(d);Log.w(TAG,"Gemini model failed request=$requestId $d");val s=(e as? GeminiHttpException)?.statusCode;if(s==401||s==403)break}};deliver(requestId,null,null,summarizeFailures(failures))}}
 private fun callGemini(apiKey:String,model:String,prompt:String):String{val endpoint="https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey";val payload=JSONObject().apply{put("contents",JSONArray().put(JSONObject().put("role","user").put("parts",JSONArray().put(JSONObject().put("text",prompt)))));put("generationConfig",JSONObject().put("maxOutputTokens",8192))};val request=Request.Builder().url(endpoint).post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())).build();httpClient.newCall(request).execute().use{r->val body=r.body?.string().orEmpty();if(!r.isSuccessful)throw GeminiHttpException(r.code,compactError(body).take(360));val candidates=JSONObject(body).optJSONArray("candidates")?:throw IllegalStateException("No candidates");val parts=candidates.optJSONObject(0)?.optJSONObject("content")?.optJSONArray("parts")?:throw IllegalStateException("No content parts");return buildString{for(i in 0 until parts.length())append(parts.optJSONObject(i)?.optString("text").orEmpty())}.trim()}}
 private fun deliver(id:String,text:String?,model:String?,error:String?){val p=JSONObject().put("requestId",id).put("text",text?:JSONObject.NULL).put("model",model?:JSONObject.NULL).put("error",error?:JSONObject.NULL).toString();activity.runOnUiThread{onGeminiResult(p)}}
 private fun summarizeFailures(f:List<String>)=when{f.any{it.contains("HTTP 429")}->"Gemini quota exceeded (HTTP 429). Wait for quota reset or use another API key.";f.any{it.contains("HTTP 401")||it.contains("HTTP 403")}->"Gemini API key rejected. Check the key permissions and billing.";f.any{it.contains("Unable to resolve host")||it.contains("timeout",true)}->"Gemini network unavailable. Check the phone connection and try again.";f.isEmpty()->"No Gemini model succeeded";else->f.take(3).joinToString("; ").take(900)}
 private fun compactError(v:String)=v.replace(Regex("\\s+")," ").trim(); private fun prefs()=activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
 private fun getApiKey():String{val s=prefs().getString(KEY_API_KEY,"").orEmpty().trim();if(s.isBlank())return "";if(s.startsWith(ENCRYPTED_PREFIX))return decrypt(s).orEmpty().trim();return s.also{try{prefs().edit().putString(KEY_API_KEY,encrypt(it)).apply()}catch(_:Exception){}}}
 private fun migratePreferences(){val c=prefs();if(c.contains(KEY_API_KEY)){getApiKey();return};val k=activity.getSharedPreferences(LEGACY_PREFS,Context.MODE_PRIVATE).getString(KEY_API_KEY,"").orEmpty().trim();if(k.isNotBlank())setGeminiApiKey(k)}
 private fun getOrCreateSecretKey():SecretKey{val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};(ks.getKey(KEY_ALIAS,null) as? SecretKey)?.let{return it};val g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());return g.generateKey()}
 private fun encrypt(v:String):String{val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,getOrCreateSecretKey());val e=c.doFinal(v.toByteArray());val p=ByteArray(1+c.iv.size+e.size);p[0]=c.iv.size.toByte();System.arraycopy(c.iv,0,p,1,c.iv.size);System.arraycopy(e,0,p,1+c.iv.size,e.size);return ENCRYPTED_PREFIX+Base64.encodeToString(p,Base64.NO_WRAP)}
 private fun decrypt(v:String):String?=try{val p=Base64.decode(v.removePrefix(ENCRYPTED_PREFIX),Base64.NO_WRAP);if(p.isEmpty())null else{val n=p[0].toInt() and 0xFF;if(n<=0||p.size<=1+n)null else{val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,getOrCreateSecretKey(),GCMParameterSpec(128,p.copyOfRange(1,1+n)));String(c.doFinal(p.copyOfRange(1+n,p.size)))}}}catch(_:Exception){null}
 @JavascriptInterface fun vibrate(ms:Long){val d=ms.coerceIn(1,2000);val v=if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.S)activity.getSystemService(VibratorManager::class.java).defaultVibrator else activity.getSystemService(Vibrator::class.java);if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O)v.vibrate(VibrationEffect.createOneShot(d,VibrationEffect.DEFAULT_AMPLITUDE)) else @Suppress("DEPRECATION") v.vibrate(d)}
 @JavascriptInterface fun share(title:String?,text:String?,url:String?){activity.runOnUiThread{val payload=listOfNotNull(text?.takeIf{it.isNotBlank()},url?.takeIf{it.isNotBlank()}).joinToString("\n");activity.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply{type="text/plain";putExtra(Intent.EXTRA_SUBJECT,title.orEmpty());putExtra(Intent.EXTRA_TEXT,payload)},title?.takeIf{it.isNotBlank()}?:"Share"))}}
 @JavascriptInterface fun copyToClipboard(text:String?){activity.runOnUiThread{(activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Crew Builder",text.orEmpty()))}}
 @JavascriptInterface fun getLastLocation():String?{if(Build.VERSION.SDK_INT>=23&&activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){activity.runOnUiThread{activity.requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),702)};return null};val lm=activity.getSystemService(Context.LOCATION_SERVICE) as LocationManager;val loc=listOf(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER).mapNotNull{try{lm.getLastKnownLocation(it)}catch(_:Exception){null}}.maxByOrNull{it.time}?:return null;return JSONObject().put("lat",loc.latitude).put("lng",loc.longitude).put("accuracy",loc.accuracy).put("timestamp",loc.time).toString()}
 fun destroy(){live.stop();executor.shutdownNow()}
}
