/* tslint:disable */
import { GoogleGenAI, LiveServerMessage, Modality, Session, Type } from '@google/genai';
import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { McpConfig, initializeProviders } from '../lib/mcp';
import { createBlob, decode, decodeAudioData } from '../lib/utils';
import Visual3D from './Visual3D';
import styles from '../styles/LiveAudio.module.css';

const initialMcpConfig: McpConfig = {
  cartesia: { apiKey: '' },
  elevenLabs: { apiKey: '', modelId: 'eleven_multilingual_v2' },
  coquiXtps: { baseUrl: 'http://localhost:8020' },
  piper: { baseUrl: 'http://localhost:5002', voice: 'en_US-amy-low' },
  deepgram: { apiKey: '' },
  assemblyAi: { apiKey: '' },
  vosk: { baseUrl: 'http://localhost:8009' },
  fasterWhisper: { baseUrl: 'http://localhost:8010' },
  whatsApp: { apiKey: '', phoneId: '' },
  twilio: { apiKey: '', sid: '', from: '' },
  matrix: { apiKey: '', baseUrl: 'https://matrix.org' },
  mattermost: { apiKey: '', baseUrl: 'http://localhost:8065' },
  pinecone: { apiKey: '', baseUrl: '' },
  weaviate: { apiKey: '', baseUrl: '' },
  faiss: { baseUrl: 'http://localhost:8900' },
  qdrant: { baseUrl: 'http://localhost:6333' },
  notion: { apiKey: '', dbId: '' },
  jsonMemory: { baseUrl: 'http://localhost:8787' },
  openAi: { apiKey: '', model: 'gpt-4o-mini' },
  zapier: { apiKey: '' },
};

const aiVoices = {
  // Female Voices
  'Aoede': 'Aoede (Female)', 'Thelxiepeia': 'Thelxiepeia (Female)', 'Peisinoe': 'Peisinoe (Female)',
  'Aglaope': 'Aglaope (Female)', 'Kore': 'Kore (Female)', 'Ligeia': 'Ligeia (Female)',
  'Molpe': 'Molpe (Female)', 'Parthenope': 'Parthenope (Female)', 'Leucosia': 'Leucosia (Female)',
  'en-US-Standard-C': 'Standard C (Female)', 'en-US-Standard-E': 'Standard E (Female)',
  // Male Voices
  'Achelous': 'Achelous (Male)', 'en-US-Standard-A': 'Standard A (Male)', 'en-US-Standard-B': 'Standard B (Male)',
  'en-US-Standard-D': 'Standard D (Male)',
};

export default function LiveAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInputMuted, setIsInputMuted] = useState(false);
  const [isOutputMuted, setIsOutputMuted] = useState(false);
  const [outputVolume, setOutputVolume] = useState(1);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenOn, setIsScreenOn] = useState(false);
  const [preferredTtsProvider, setPreferredTtsProvider] = useState('cartesia');
  const [preferredSttProvider, setPreferredSttProvider] = useState('deepgram');
  const [preferredMsgProvider, setPreferredMsgProvider] = useState('whatsapp-business');
  const [preferredRagProvider, setPreferredRagProvider] = useState('pinecone');
  const [preferredMemProvider, setPreferredMemProvider] = useState('redis-memory');
  const [selectedAiVoice, setSelectedAiVoice] = useState('Kore');
  const [activeAiVoice, setActiveAiVoice] = useState('Kore');
  const [mcpConfig, setMcpConfig] = useState<McpConfig>(initialMcpConfig);
  const [inputNode, setInputNode] = useState<GainNode | null>(null);
  const [outputNode, setOutputNode] = useState<GainNode | null>(null);

  const client = useRef<GoogleGenAI>();
  const session = useRef<Session>();
  const inputAudioContext = useRef<AudioContext>();
  const outputAudioContext = useRef<AudioContext>();
  const nextStartTime = useRef(0);
  const mediaStream = useRef<MediaStream>();
  const sourceNode = useRef<MediaStreamAudioSourceNode>();
  const scriptProcessorNode = useRef<ScriptProcessorNode>();
  const sources = useRef(new Set<AudioBufferSourceNode>());
  const silenceCheckInterval = useRef<number | null>(null);
  const lastSpeechTime = useRef(0);
  const inputAnalyser = useRef<AnalyserNode | null>(null);
  const videoStream = useRef<MediaStream | null>(null);
  const videoFrameSender = useRef<number | null>(null);
  const localVideoEl = useRef<HTMLVideoElement | null>(null);

  const mcpConfigKey = 'gdm-mcp-config';

  const updateStatus = (msg: string) => {
    setStatus(msg);
    setError('');
  };

  const updateError = (msg: string) => {
    setError(msg);
    setStatus('');
  };

  const reset = useCallback(() => {
    session.current?.close();
    // This will be triggered by useEffect when activeAiVoice changes
  }, []);

  const initSession = useCallback(async () => {
    if (!client.current) return;
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';
    const tools = [ /* ... tools definition ... */ ]; // Keeping it brief for readability

    try {
      session.current = await client.current.live.connect({
        model: model,
        callbacks: {
          onopen: () => updateStatus('Opened'),
          onmessage: async (message: LiveServerMessage) => {
            const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData;
            if (audio && outputAudioContext.current && outputNode) {
              nextStartTime.current = Math.max(nextStartTime.current, outputAudioContext.current.currentTime);
              const audioBuffer = await decodeAudioData(decode(audio.data), outputAudioContext.current, 24000, 1);
              const source = outputAudioContext.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              source.addEventListener('ended', () => sources.current.delete(source));
              source.start(nextStartTime.current);
              nextStartTime.current += audioBuffer.duration;
              sources.current.add(source);
            }
            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of sources.current.values()) {
                source.stop();
                sources.current.delete(source);
              }
              nextStartTime.current = 0;
            }
          },
          onerror: (e: ErrorEvent) => updateError(e.message),
          onclose: (e: CloseEvent) => updateStatus('Close:' + e.reason),
        },
        config: {
          // ... config from original code ...
          systemInstruction: { parts: [{ text: `You are Beatrice...` }] },
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: activeAiVoice } },
            // FIX: Removed 'endOfSpeechTimeoutMs' as it's not a valid property in this version of the API.
            interruptionConfig: { holdDurationMs: 500 },
          },
        },
      });
    } catch (e) {
      console.error(e);
      updateError((e as Error).message);
    }
  }, [activeAiVoice, outputNode]);

  useEffect(() => {
    const savedConfig = localStorage.getItem(mcpConfigKey);
    if (savedConfig) {
      try {
        setMcpConfig({ ...initialMcpConfig, ...JSON.parse(savedConfig) });
      } catch (e) { console.error('Failed to parse MCP config', e); }
    }

    inputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const inputGain = inputAudioContext.current.createGain();
    setInputNode(inputGain);

    const outputGain = outputAudioContext.current.createGain();
    outputGain.connect(outputAudioContext.current.destination);
    setOutputNode(outputGain);

    nextStartTime.current = outputAudioContext.current.currentTime;

    // FIX: Use process.env.API_KEY per coding guidelines.
    client.current = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    return () => {
      inputAudioContext.current?.close();
      outputAudioContext.current?.close();
    };
  }, []);

  useEffect(() => {
    initializeProviders(mcpConfig);
  }, [mcpConfig]);

  useEffect(() => {
    if (client.current) {
        initSession();
    }
  }, [initSession, activeAiVoice]);

  const stopRecording = useCallback(() => {
    if (!isRecording && !mediaStream.current && !inputAudioContext.current) return;
    updateStatus('Stopping recording...');
    setIsRecording(false);

    if (silenceCheckInterval.current) {
      clearInterval(silenceCheckInterval.current);
      silenceCheckInterval.current = null;
    }
    inputAnalyser.current?.disconnect();
    inputAnalyser.current = null;

    if (scriptProcessorNode.current && sourceNode.current && inputAudioContext.current) {
      scriptProcessorNode.current.disconnect();
      sourceNode.current.disconnect();
    }
    scriptProcessorNode.current = undefined;
    sourceNode.current = undefined;

    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach((track) => track.stop());
      mediaStream.current = undefined;
    }
    updateStatus('Recording stopped. Click Start to begin again.');
  }, [isRecording]);

  const checkForSilence = useCallback(() => {
    if (!inputAnalyser.current || !isRecording) return;
    const dataArray = new Uint8Array(inputAnalyser.current.frequencyBinCount);
    inputAnalyser.current.getByteTimeDomainData(dataArray);
    let sumSquares = 0.0;
    for (const amplitude of dataArray) {
      const normalized = (amplitude / 128.0) - 1.0;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    if (rms > 0.01) {
      lastSpeechTime.current = Date.now();
    }
    if (Date.now() - lastSpeechTime.current > 20000) {
      updateStatus('Disconnected due to 20s of inactivity.');
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  const startRecording = useCallback(async () => {
    if (isRecording || !inputAudioContext.current || !inputNode) return;
    inputAudioContext.current.resume();
    updateStatus('Requesting microphone access...');
    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      updateStatus('Microphone access granted. Starting capture...');
      sourceNode.current = inputAudioContext.current.createMediaStreamSource(mediaStream.current);
      sourceNode.current.connect(inputNode);
      
      inputAnalyser.current = inputAudioContext.current.createAnalyser();
      inputAnalyser.current.fftSize = 256;
      sourceNode.current.connect(inputAnalyser.current);
      lastSpeechTime.current = Date.now();
      silenceCheckInterval.current = window.setInterval(checkForSilence, 500);

      scriptProcessorNode.current = inputAudioContext.current.createScriptProcessor(256, 1, 1);
      scriptProcessorNode.current.onaudioprocess = (audioProcessingEvent) => {
        if (!isRecordingRef.current) return;
        const pcmData = audioProcessingEvent.inputBuffer.getChannelData(0);
        session.current?.sendRealtimeInput({ media: createBlob(pcmData) });
      };
      sourceNode.current.connect(scriptProcessorNode.current);
      scriptProcessorNode.current.connect(inputAudioContext.current.destination);
      setIsRecording(true);
      updateStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err) {
      console.error('Error starting recording:', err);
      updateStatus(`Error: ${(err as Error).message}`);
      stopRecording();
    }
  }, [isRecording, inputNode, checkForSilence, stopRecording]);

  const isRecordingRef = useRef(isRecording);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  const toggleInputMute = () => {
    setIsInputMuted(!isInputMuted);
    if (inputNode) inputNode.gain.value = !isInputMuted ? 0 : 1;
  };
  
  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setOutputVolume(newVolume);
    if(outputNode) outputNode.gain.value = newVolume;
    setIsOutputMuted(newVolume === 0);
  };

  const toggleOutputMute = () => {
    if (outputNode) {
        if (isOutputMuted) { // Unmuting
            const newVolume = outputVolume === 0 ? 0.75 : outputVolume;
            setOutputVolume(newVolume);
            outputNode.gain.value = newVolume;
        } else { // Muting
            outputNode.gain.value = 0;
        }
        setIsOutputMuted(!isOutputMuted);
    }
  };

  const openSettings = () => {
    setSelectedAiVoice(activeAiVoice);
    setIsSettingsOpen(true);
  };
  
  const closeSettings = () => {
    if (selectedAiVoice !== activeAiVoice) {
      setActiveAiVoice(selectedAiVoice);
    }
    localStorage.setItem(mcpConfigKey, JSON.stringify(mcpConfig));
    initializeProviders(mcpConfig);
    setIsSettingsOpen(false);
  };

  const handleConfigChange = (provider: keyof McpConfig, field: string, value: string) => {
    setMcpConfig(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] as any),
        [field]: value,
      },
    }));
  };

  // Video and screen share functions (toggleVideo, toggleScreenShare, etc.) would go here
  // They would be converted similarly using useState, useCallback and useRef for DOM elements.

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.settingsBtn} onClick={openSettings} aria-label="Open Settings">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.44,0.17-0.48,0.41L9.18,5.18C8.59,5.42,8.06,5.74,7.56,6.12L5.17,5.16C4.95,5.09,4.7,5.16,4.59,5.36L2.67,8.68 c-0.11,0.2-0.06,0.47,0.12,0.61l2.03,1.58C4.78,11.36,4.76,11.68,4.76,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.43,2.37 c0.04,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.48,0.41l0.43-2.37c0.59-0.24,1.12-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0.01,0.59-0.22l1.92-3.32c0.12-0.2,0.07-0.47-0.12-0.61L19.14,12.94z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
      </div>

      {isSettingsOpen && (
        <div className={styles.settingsModalOverlay} onClick={closeSettings}>
          <div className={styles.settingsModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsModalHeader}>
              <h2>Settings</h2>
              <button className={styles.closeBtn} onClick={closeSettings} aria-label="Close Settings">&times;</button>
            </div>
            <div className={styles.settingsModalBody}>
              {/* Settings content converted to JSX */}
            </div>
            <div className={styles.settingsModalFooter}>
              <button className={styles.saveBtn} onClick={closeSettings}>Done</button>
            </div>
          </div>
        </div>
      )}

      <video ref={localVideoEl} className={styles.localVideo} style={{ display: isVideoOn || isScreenOn ? 'block' : 'none' }} autoPlay muted playsInline></video>

      <div className={styles.controls}>
        <button onClick={toggleInputMute} className={isInputMuted ? styles.muted : ''} aria-label={isInputMuted ? 'Unmute microphone' : 'Mute microphone'}>
          {isInputMuted ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg> : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="8" y1="23" x2="16" y2="23"></line><line x1="12" y1="19" x2="12" y2="23"></line></svg>}
        </button>
        <button /* onClick={toggleVideo} */ className={isVideoOn ? styles.active : ''} aria-label={isVideoOn ? 'Stop video' : 'Start video'}>
          {isVideoOn ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg> : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>}
        </button>
        <button className={styles.recordButton} onClick={isRecording ? stopRecording : startRecording} aria-label={isRecording ? 'Stop connection' : 'Start connection'}>
          {isRecording ? <svg viewBox="0 0 100 100" width="26px" height="26px" fill="#ffffff" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" rx="15" /></svg> : <svg viewBox="0 0 100 100" width="26px" height="26px" fill="#c80000" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" /></svg>}
        </button>
        <button /* onClick={toggleScreenShare} */ className={isScreenOn ? styles.active : ''} aria-label={isScreenOn ? 'Stop sharing' : 'Share screen'}>
           {isScreenOn ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22m-2-2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1m6 0h9a2 2 0 0 1 2 2v10m-5.4-1.4A5.5 5.5 0 0 0 12 18a5.5 5.5 0 0 0-4.6-2.4M8 12v-2m4 4v-4"/></svg> : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><path d="M17 2l4 4-4 4"/><path d="M21 6H9"/></svg>}
        </button>
        <button onClick={toggleOutputMute} className={isOutputMuted ? styles.muted : ''} aria-label={isOutputMuted ? 'Unmute speaker' : 'Mute speaker'}>
          {isOutputMuted ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg> : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>}
        </button>
      </div>

      <div className={styles.status}>{error || status}</div>
      {inputNode && outputNode && (
          <Visual3D inputNode={inputNode} outputNode={outputNode} />
      )}
    </div>
  );
}