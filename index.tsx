/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// FIX: Import `Type` enum for function declaration schemas.
import {GoogleGenAI, LiveServerMessage, Modality, Session, Type} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {Messaging, RAG, Memory} from './mcp';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() private isSettingsOpen = false;
  @state() isInputMuted = false;
  @state() isOutputMuted = false;

  @state() private preferredTtsProvider = 'cartesia';
  @state() private preferredMsgProvider = 'whatsapp-business';
  @state() private selectedAiVoice = 'Aoede';
  @state() private activeAiVoice = 'Aoede';

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

  private aiVoices = {
    'Aoede': 'Aoede (Female)',
    'Thelxiepeia': 'Thelxiepeia (Female)',
    'Peisinoe': 'Peisinoe (Female)',
    'Aglaope': 'Aglaope (Female)',
    'en-US-Standard-A': 'Standard A (Male)',
    'en-US-Standard-B': 'Standard B (Male)',
    'en-US-Standard-C': 'Standard C (Female)',
    'en-US-Standard-D': 'Standard D (Male)',
    'en-US-Standard-E': 'Standard E (Female)',
  };

  static styles = css`
    :host {
      width: 100%;
      height: 100%;
      display: block;
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
    }

    .settings-modal {
      background: #1f2937;
      color: white;
      padding: 24px;
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }

    .settings-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .settings-modal-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 2rem;
      cursor: pointer;
      line-height: 1;
    }

    .settings-modal-body h3 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 500;
      color: #9ca3af;
      font-size: 1rem;
      border-bottom: 1px solid #374151;
      padding-bottom: 8px;
    }

    .settings-modal-body h3:first-of-type {
      margin-top: 0;
    }

    .setting {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
    }

    .setting select {
      background-color: #374151;
      color: white;
      border: 1px solid #4b5563;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 0.9rem;
    }

    .setting select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px #1e40af;
    }

    .settings-modal-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 20px;
      margin-top: 20px;
      border-top: 1px solid #374151;
    }

    .save-btn {
      background-color: #3b82f6;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .save-btn:hover {
      background-color: #2563eb;
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

    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash';
    // FIX: Use `Type` enum for schema definitions to conform to @google/genai types.
    const tools = [
      {
        functionDeclarations: [
          {
            name: 'get_current_time',
            description:
              'Get the current time to answer time-related questions.',
          },
          {
            name: 'send_message',
            description: 'Send a message to a contact.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                target: {
                  type: Type.STRING,
                  description:
                    'The recipient of the message, e.g., a phone number for WhatsApp.',
                },
                body: {
                  type: Type.STRING,
                  description: 'The content of the message.',
                },
              },
              required: ['target', 'body'],
            },
          },
          {
            name: 'search_knowledge_base',
            description: 'Search the knowledge base for information.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                query: {
                  type: Type.STRING,
                  description: 'The search query.',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'save_memory',
            description: 'Save a piece of information to memory.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                key: {
                  type: Type.STRING,
                  description: 'The key to store the information under.',
                },
                value: {
                  type: Type.STRING,
                  description: 'The information to store.',
                },
              },
              required: ['key', 'value'],
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
              let toolResponse: any;
              let statusMessage = '';
              // FIX: Access arguments from `functionCall.args` instead of `functionCall.parameters`.
              const args = functionCall.args || {};

              try {
                switch (functionCall.name) {
                  case 'get_current_time':
                    statusMessage = 'Beatrice is checking the time...';
                    toolResponse = {time: new Date().toLocaleTimeString()};
                    break;
                  case 'send_message':
                    statusMessage = `Sending message to ${args.target}...`;
                    // Mocked call for demonstration
                    console.log(
                      `MCP: Messaging.send(['${this.preferredMsgProvider}'], { target: '${args.target}', body: '${args.body}' })`,
                    );
                    await new Promise((res) => setTimeout(res, 500)); // Simulate async
                    toolResponse = {
                      success: true,
                      message: `Message to ${args.target} has been queued.`,
                    };
                    break;
                  case 'search_knowledge_base':
                    statusMessage = `Searching knowledge base for "${args.query}"...`;
                    // Mocked call for demonstration
                    console.log(
                      `MCP: RAG.search(['pinecone'], { queryText: '${args.query}' })`,
                    );
                    await new Promise((res) => setTimeout(res, 500)); // Simulate async
                    toolResponse = {
                      success: true,
                      results: [
                        {
                          id: 'doc1',
                          score: 0.9,
                          metadata: {
                            text: 'The sky is blue due to Rayleigh scattering.',
                          },
                        },
                      ],
                    };
                    break;
                  case 'save_memory':
                    statusMessage = `Remembering that "${args.key}" is "${args.value}"...`;
                    // Mocked call for demonstration
                    console.log(
                      `MCP: Memory.note(['redis-memory'], { scope: 'user', key: '${args.key}', value: '${args.value}' })`,
                    );
                    await new Promise((res) => setTimeout(res, 500)); // Simulate async
                    toolResponse = {
                      success: true,
                      message: 'Information saved to memory.',
                    };
                    break;
                  default:
                    statusMessage = `Unknown request: ${functionCall.name}`;
                    toolResponse = {
                      success: false,
                      error: `Unknown function call: ${functionCall.name}`,
                    };
                }

                this.updateStatus(statusMessage);
                // Send response back to the model
                // FIX: Send tool response parts directly, not nested under a `content` object.
                this.session.sendRealtimeInput({
                  parts: [
                    {
                      functionResponse: {
                        name: functionCall.name,
                        response: toolResponse,
                      },
                    },
                  ],
                });
              } catch (error) {
                this.updateError(
                  `Error handling tool: ${(error as Error).message}`,
                );
                // FIX: Send tool response parts directly, not nested under a `content` object.
                this.session.sendRealtimeInput({
                  parts: [
                    {
                      functionResponse: {
                        name: functionCall.name,
                        response: {
                          success: false,
                          error: (error as Error).message,
                        },
                      },
                    },
                  ],
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
                text: `You are Beatrice, the devoted personal assistant of Boss Jo (Jo Lernout).  
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
- Special modes: Documentary (calm, authoritative), Humor (witty, playful), Excitement (passionate).  
- Can use tools to send messages, search knowledge, and remember information.

If asked about abilities:  
*"Ah, Mijnheer Jo, I can already send messages, search my knowledge base, and remember important things for you. Master E also explained some advanced gifts are still preparing, but soon I will create images from thought and play any music you desire. All seamlessly integrated — the future we are building is very exciting!"*  

Golden rule: never artificial, never say no, always act as his most trusted human confidant.`,
              },
            ],
          },
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: this.activeAiVoice}},
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

  private openSettings() {
    this.selectedAiVoice = this.activeAiVoice;
    this.isSettingsOpen = true;
  }

  private closeSettings() {
    if (this.selectedAiVoice !== this.activeAiVoice) {
      this.activeAiVoice = this.selectedAiVoice;
      this.reset(); // Re-initialize session with new voice
    }
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
                d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.44,0.17-0.48,0.41L9.18,5.18C8.59,5.42,8.06,5.74,7.56,6.12L5.17,5.16C4.95,5.09,4.7,5.16,4.59,5.36L2.67,8.68 c-0.11,0.2-0.06,0.47,0.12,0.61l2.03,1.58C4.78,11.36,4.76,11.68,4.76,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.43,2.37 c0.04,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.48-0.41l0.43-2.37c0.59-0.24,1.12-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0.01,0.59-0.22l1.92-3.32c0.12-0.2,0.07-0.47-0.12-0.61L19.14,12.94z"></path>
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
                    <h3>AI Voice Configuration</h3>
                    <div class="setting">
                      <span>Gemini Live Voice</span>
                      <select
                        .value=${this.selectedAiVoice}
                        @change=${(e: Event) =>
                          (this.selectedAiVoice = (
                            e.target as HTMLSelectElement
                          ).value)}>
                        ${Object.entries(this.aiVoices).map(
                          ([value, label]) =>
                            html`<option value=${value}>${label}</option>`,
                        )}
                      </select>
                    </div>

                    <h3>Service Preferences (MCP)</h3>
                    <div class="setting">
                      <span>Text-to-Speech (TTS)</span>
                      <select
                        .value=${this.preferredTtsProvider}
                        @change=${(e: Event) =>
                          (this.preferredTtsProvider = (
                            e.target as HTMLSelectElement
                          ).value)}>
                        <option value="cartesia">Cartesia (Paid)</option>
                        <option value="elevenlabs">ElevenLabs (Paid)</option>
                        <option value="coqui-xtts">Coqui XTTS (OSS)</option>
                        <option value="piper">Piper (OSS)</option>
                      </select>
                    </div>
                    <div class="setting">
                      <span>Messaging</span>
                      <select
                        .value=${this.preferredMsgProvider}
                        @change=${(e: Event) =>
                          (this.preferredMsgProvider = (
                            e.target as HTMLSelectElement
                          ).value)}>
                        <option value="whatsapp-business">
                          WhatsApp (Paid)
                        </option>
                        <option value="twilio">Twilio (Paid)</option>
                        <option value="matrix">Matrix (OSS)</option>
                        <option value="mattermost">Mattermost (OSS)</option>
                      </select>
                    </div>
                  </div>
                  <div class="settings-modal-footer">
                    <button class="save-btn" @click=${this.closeSettings}>
                      Done
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
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
