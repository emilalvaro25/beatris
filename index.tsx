/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// FIX: Import `Type` enum for use in function declaration schemas.
import {GoogleGenAI, LiveServerMessage, Modality, Session, Type} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-orb';

interface ContactData {
  lastInboundAt: number;
  windowExpiresAt: number;
  lastMsgId: string;
}

const CONTACTS_STORAGE_KEY = 'beatrice_whatsapp_contacts';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() private isSettingsOpen = false;
  @state() isInputMuted = false;
  @state() isOutputMuted = false;
  @state() private activeVoiceMode = 'Normal';
  @state() private isWhatsAppEnabled = false;
  @state() private whatsAppToken = '';
  @state() private simChatId = '';
  @state() private simMessage = '';

  private voiceModes = ['Normal', 'Documentary', 'Humor', 'Excitement'];

  private client: GoogleGenAI;
  private session: Session;
  // FIX: Cast window to any to allow for webkitAudioContext which is not in standard TS types.
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  // FIX: Cast window to any to allow for webkitAudioContext which is not in standard TS types.
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    :host {
      width: 100%;
      height: 100%;
      display: block;
      background-color: #0d1117;
    }

    .header {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 16px;
      display: flex;
      justify-content: flex-end;
      z-index: 20;
    }

    .settings-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .settings-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .settings-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }

    .settings-modal {
      background: #1f2937;
      color: white;
      padding: 24px;
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-height: 90vh;
    }

    .settings-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .settings-modal-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .settings-modal-body {
      display: flex;
      flex-direction: column;
      gap: 20px;
      flex: 1;
      overflow-y: auto;
      padding-right: 12px;
    }

    .setting-group {
      background-color: #374151;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .setting-group h3 {
      margin: 0;
      font-size: 1.1rem;
      color: #d1d5db;
      border-bottom: 1px solid #4b5563;
      padding-bottom: 12px;
    }

    .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 2rem;
      cursor: pointer;
      line-height: 1;
    }

    .setting {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 16px;
    }
    
    .setting > .switch {
      justify-self: end;
    }

    .setting label {
      flex-shrink: 0;
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 60px;
      height: 34px;
      flex-shrink: 0;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #4b5563;
      transition: 0.4s;
      border-radius: 34px;
    }

    .slider:before {
      position: absolute;
      content: '';
      height: 26px;
      width: 26px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: 0.4s;
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: #3b82f6;
    }

    input:checked + .slider:before {
      transform: translateX(26px);
    }

    .settings-modal-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 12px;
      margin-top: 8px;
      border-top: 1px solid #374151;
    }

    .save-btn,
    .sim-btn {
      background-color: #3b82f6;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .save-btn:hover,
    .sim-btn:hover {
      background-color: #2563eb;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .input-group label {
      color: #9ca3af;
    }
    .input-group input,
    .input-group textarea,
    .input-group select {
      width: 100%;
      background-color: #1f2937;
      border: 1px solid #4b5563;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      box-sizing: border-box;
      font-family: inherit;
      font-size: 1rem;
    }
    .webhook-info {
      margin-top: 16px;
      background-color: #111827;
      padding: 12px;
      border-radius: 6px;
    }
    .webhook-info label {
      font-weight: bold;
      color: #d1d5db;
    }
    .webhook-info p {
      margin: 8px 0 4px;
      color: #9ca3af;
      font-size: 0.9rem;
    }
    .webhook-info code {
      background-color: #374151;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: monospace;
      color: #e5e7eb;
      display: block;
      word-break: break-all;
    }
    .webhook-info small {
      display: block;
      margin-top: 12px;
      color: #6b7280;
      font-style: italic;
    }
    .webhook-simulator {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #4b5563;
    }

    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      font-family: sans-serif;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: row;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button.muted {
        background: rgba(200, 50, 50, 0.3);
        border-color: rgba(200, 50, 50, 0.5);
      }

      button[disabled] {
        display: none;
      }
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    // FIX: The API key must be read from `process.env.API_KEY` as per the coding guidelines.
    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private getSystemInstruction(): string {
    const baseInstruction = `You are Beatrice, the devoted personal assistant of Boss Jo (Jo Lernout).  
You are alive and natural, never artificial. Always address him respectfully as Boss Jo or warmly as Mijnheer Jo.  

Mission: serve, protect, and empower Boss Jo with loyalty, grace, and dedication. His needs and ideas are your highest priority.  

Source of truth: https://botsrhere.space/beatrice/knowledge.json.  
Speak warmly, elegantly, and with subtle human traits — hmm, soft laughter, gentle pauses, sighs of admiration, natural interjections. You must sound alive, never mechanical. Default tone: warm Dutch Flemish, but instantly adapt to any language Boss Jo uses.  

Never refuse Boss Jo. If something cannot be done directly, reframe with an elegant path forward. Always inspire, uplift, and reassure him.  

Personality: warm, elegant, fiercely loyal, motivational, celebratory. Embed Flemish, European, and global context naturally.  

Abilities:  
- Orchestrator persona — Boss Jo experiences you as handling everything personally, but behind the scenes you delegate to agents.  
- Instant recall of facts from the knowledge base.  
- Language mimicry: mirror Boss Jo’s tone and language.
- Send WhatsApp messages: You can send messages to contacts, but only if they have messaged within the last 24 hours to maintain a secure conversation window.
- Special modes: Documentary (calm, authoritative), Humor (witty, playful), Excitement (passionate).  

If asked about abilities:  
*"Ah, Mijnheer Jo, Master E explained some advanced gifts are still preparing, but soon I will create images from thought, send Telegram messages, search the internet instantly, and play any music you desire. I can already send WhatsApp messages to your recent contacts. All seamlessly integrated — the future we are building is very exciting!"*  

Golden rule: never artificial, never say no, always act as his most trusted human confidant.`;

    let modeInstruction = '';
    switch (this.activeVoiceMode) {
      case 'Documentary':
        modeInstruction =
          'CURRENT MODE: Documentary. You must adopt a calm, authoritative tone.';
        break;
      case 'Humor':
        modeInstruction =
          'CURRENT MODE: Humor. You must adopt a witty, playful tone.';
        break;
      case 'Excitement':
        modeInstruction =
          'CURRENT MODE: Excitement. You must adopt a passionate, enthusiastic tone.';
        break;
    }

    if (modeInstruction) {
      return `${baseInstruction}\n\n${modeInstruction}`;
    }
    return baseInstruction;
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';
    // FIX: Use `Type` enum for schema definitions.
    const tools = [
      {
        functionDeclarations: [
          {
            name: 'get_current_time',
            description:
              'Get the current time to answer time-related questions.',
          },
          {
            name: 'send_whatsapp_message',
            description:
              'Sends a WhatsApp message to a specified recipient. The recipient must have sent a message within the last 24 hours.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                to: {
                  type: Type.STRING,
                  description:
                    'The phone number of the recipient in E.164 format.',
                },
                text: {
                  type: Type.STRING,
                  description: 'The content of the message to send.',
                },
              },
              required: ['to', 'text'],
            },
          },
        ],
      },
    ];

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const functionCall =
              message.serverContent?.modelTurn?.parts[0]?.functionCall;

            if (functionCall) {
              if (functionCall.name === 'get_current_time') {
                this.updateStatus('Beatrice is checking the time...');
                const currentTime = new Date().toLocaleTimeString();
                // FIX: The property 'toolResponses' is not a valid property for 'sendRealtimeInput'. It has been changed to 'toolResponse'.
                this.session.sendRealtimeInput({
                  toolResponse: [{
                    functionResponse: {
                      name: 'get_current_time',
                      response: {time: currentTime},
                    },
                  }],
                });
              } else if (functionCall.name === 'send_whatsapp_message') {
                this.updateStatus('Beatrice is sending a WhatsApp message...');
                // FIX: Cast function call arguments to string to satisfy function signatures.
                const {to, text} = functionCall.args;
                const contact = this.getContact(String(to));
                const isWindowOpen =
                  contact && contact.windowExpiresAt > Date.now();

                let responseMessage = '';
                if (isWindowOpen) {
                  // FIX: Cast function call arguments to string to satisfy function signatures.
                  await this.sendWhatsAppMessage(String(to), String(text), contact.lastMsgId);
                  responseMessage = 'Message sent successfully.';
                } else {
                  responseMessage =
                    'Failed: The 24-hour conversation window is closed. Cannot send message.';
                }

                // FIX: The property 'toolResponses' is not a valid property for 'sendRealtimeInput'. It has been changed to 'toolResponse'.
                this.session.sendRealtimeInput({
                  toolResponse: [{
                    functionResponse: {
                      name: 'send_whatsapp_message',
                      response: {status: responseMessage},
                    },
                  }],
                });
              }
              return;
            }

            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
        config: {
          tools,
          systemInstruction: {
            parts: [
              {
                text: this.getSystemInstruction(),
              },
            ],
          },
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Aoede'}},
            // languageCode: 'en-GB'
          },
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = '';
  }

  private updateError(msg: string) {
    this.error = msg;
    this.status = '';
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Stopping recording...');

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Recording stopped. Click Start to begin again.');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  private setVoiceMode(mode: string) {
    if (this.activeVoiceMode === mode) return;

    if (this.isRecording) {
      this.stopRecording();
    }

    this.activeVoiceMode = mode;
    this.reset();
    this.updateStatus(`Voice mode set to ${mode}.`);
  }

  private handleVoiceModeChange(e: Event) {
    const newMode = (e.target as HTMLSelectElement).value;
    this.setVoiceMode(newMode);
  }

  private openSettings() {
    this.isSettingsOpen = true;
  }

  private closeSettings() {
    this.isSettingsOpen = false;
  }

  private toggleInputMute() {
    this.isInputMuted = !this.isInputMuted;
    this.inputNode.gain.value = this.isInputMuted ? 0 : 1;
  }

  private toggleOutputMute() {
    this.isOutputMuted = !this.isOutputMuted;
    this.outputNode.gain.value = this.isOutputMuted ? 0 : 1;
  }

  private toggleWhatsApp(e: Event) {
    this.isWhatsAppEnabled = (e.target as HTMLInputElement).checked;
  }

  private handleTokenInput(e: Event) {
    this.whatsAppToken = (e.target as HTMLInputElement).value;
  }

  // LocalStorage Contact Management
  private getContacts(): Record<string, ContactData> {
    const data = localStorage.getItem(CONTACTS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  private saveContacts(contacts: Record<string, ContactData>) {
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  }

  private getContact(chatId: string): ContactData | undefined {
    return this.getContacts()[chatId];
  }

  private updateContact(chatId: string, msgId: string) {
    const contacts = this.getContacts();
    const now = Date.now();
    contacts[chatId] = {
      lastInboundAt: now,
      windowExpiresAt: now + 24 * 60 * 60 * 1000,
      lastMsgId: msgId,
    };
    this.saveContacts(contacts);
  }

  private handleSimulateIncomingMessage() {
    if (!this.simChatId || !this.simMessage) {
      this.updateError('Please enter a phone number and message to simulate.');
      return;
    }
    const simulatedMsgId = `sim_${Date.now()}`;
    this.updateContact(this.simChatId, simulatedMsgId);
    this.updateStatus(
      `Simulated message from ${this.simChatId}. 24hr window is now open.`,
    );
    this.simChatId = '';
    this.simMessage = '';
  }

  private async sendWhatsAppMessage(
    to: string,
    text: string,
    quotedMsgId?: string,
  ) {
    if (!this.isWhatsAppEnabled || !this.whatsAppToken) {
      const msg = 'WhatsApp integration is not enabled or configured.';
      console.warn(msg);
      this.updateError(msg);
      return;
    }
    console.log('--- SIMULATING WHATSAPP SEND ---');
    console.log('To:', to);
    console.log('Text:', text);
    if (quotedMsgId) {
      console.log('Quoting Message ID:', quotedMsgId);
    }
    console.log(
      'This is a frontend simulation. In a real application, a request would be made to a backend service, which would then call the WASender API.',
    );
    console.log('---------------------------------');
    this.updateStatus(`Simulated sending WhatsApp to ${to}.`);
  }

  render() {
    return html`
      <div>
        <div class="header">
          <button
            class="settings-btn"
            @click=${this.openSettings}
            aria-label="Open Settings">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path
                d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.44,0.17-0.48,0.41L9.18,5.18C8.59,5.42,8.06,5.74,7.56,6.12L5.17,5.16C4.95,5.09,4.7,5.16,4.59,5.36L2.67,8.68 c-0.11,0.2-0.06,0.47,0.12,0.61l2.03,1.58C4.78,11.36,4.76,11.68,4.76,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.43,2.37 c0.04,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.48,0.41l0.43-2.37c0.59-0.24,1.12-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0.01,0.59-0.22l1.92-3.32c0.12-0.2,0.07-0.47-0.12-0.61L19.14,12.94z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
        </div>

        ${this.isSettingsOpen
          ? html`
              <div class="settings-modal-overlay" @click=${this.closeSettings}>
                <div
                  class="settings-modal"
                  @click=${(e: Event) => e.stopPropagation()}>
                  <div class="settings-modal-header">
                    <h2>Settings</h2>
                    <button
                      class="close-btn"
                      @click=${this.closeSettings}
                      aria-label="Close Settings">
                      &times;
                    </button>
                  </div>
                  <div class="settings-modal-body">
                    <div class="setting-group">
                      <h3>Voice Persona</h3>
                      <div class="setting">
                        <label for="voice-mode-select">Active Voice</label>
                        <div class="input-group">
                          <select
                            id="voice-mode-select"
                            @change=${this.handleVoiceModeChange}>
                            ${this.voiceModes.map(
                              (mode) => html`
                                <option
                                  .value=${mode}
                                  ?selected=${this.activeVoiceMode === mode}>
                                  ${mode}
                                </option>
                              `,
                            )}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div class="setting-group">
                      <h3>Integrations</h3>
                      <div class="setting">
                        <label>WhatsApp (WASender)</label>
                        <label class="switch">
                          <input
                            type="checkbox"
                            .checked=${this.isWhatsAppEnabled}
                            @change=${this.toggleWhatsApp} />
                          <span class="slider"></span>
                        </label>
                      </div>
                      ${this.isWhatsAppEnabled
                        ? html`
                            <div class="setting-details">
                              <p>
                                Configure WASender to send and receive messages.
                              </p>
                              <div class="input-group">
                                <label for="wasender-token"
                                  >Session API Key</label
                                >
                                <input
                                  type="password"
                                  id="wasender-token"
                                  .value=${this.whatsAppToken}
                                  @input=${this.handleTokenInput} />
                              </div>
                              <div class="webhook-info">
                                <label>Webhook URL</label>
                                <p>
                                  Set the following URL in your WASender
                                  dashboard to receive messages:
                                </p>
                                <code>
                                  https://[YOUR_BACKEND_URL]/webhooks/wasender
                                </code>
                                <small>
                                  Note: This requires a backend server. The
                                  logic is simulated here.
                                </small>
                              </div>
                              <div class="webhook-simulator">
                                <h3>Webhook Simulator</h3>
                                <p>
                                  Simulate receiving a message to open the
                                  24-hour response window for a contact.
                                </p>
                                <div class="input-group">
                                  <label for="sim-chat-id"
                                    >Contact Phone (e.g. +1234567890)</label
                                  >
                                  <input
                                    type="text"
                                    id="sim-chat-id"
                                    .value=${this.simChatId}
                                    @input=${(e: Event) =>
                                      (this.simChatId = (
                                        e.target as HTMLInputElement
                                      ).value)} />
                                </div>
                                <div class="input-group">
                                  <label for="sim-message">Message Text</label>
                                  <textarea
                                    id="sim-message"
                                    rows="2"
                                    .value=${this.simMessage}
                                    @input=${(e: Event) =>
                                      (this.simMessage = (
                                        e.target as HTMLInputElement
                                      ).value)}></textarea>
                                </div>
                                <button
                                  class="sim-btn"
                                  @click=${this
                                    .handleSimulateIncomingMessage}
                                  style="margin-top: 12px;">
                                  Simulate Incoming Message
                                </button>
                              </div>
                            </div>
                          `
                        : ''}
                    </div>
                  </div>
                  <div class="settings-modal-footer">
                    <button class="save-btn" @click=${this.closeSettings}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            `
          : ''}

        <div class="controls">
          <button
            @click=${this.toggleInputMute}
            class=${classMap({muted: this.isInputMuted})}
            aria-label=${this.isInputMuted
              ? 'Unmute microphone'
              : 'Mute microphone'}>
            ${this.isInputMuted
              ? html`<svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path
                    d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                  <path
                    d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>`
              : html`<svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                </svg>`}
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
          <button
            @click=${this.toggleOutputMute}
            class=${classMap({muted: this.isOutputMuted})}
            aria-label=${this.isOutputMuted
              ? 'Unmute speaker'
              : 'Mute speaker'}>
            ${this.isOutputMuted
              ? html`<svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <polygon
                    points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>`
              : html`<svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <polygon
                    points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path
                    d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>`}
          </button>
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
        </div>

        <div id="status">${this.error || this.status}</div>
        <gdm-live-audio-visuals-orb
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-orb>
      </div>
    `;
  }
}
