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
import {McpConfig, Voice, initializeProviders} from './mcp';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

const initialMcpConfig: McpConfig = {
  cartesia: {apiKey: ''},
  elevenLabs: {apiKey: '', modelId: 'eleven_multilingual_v2'},
  coquiXtps: {baseUrl: 'http://localhost:8020'},
  piper: {baseUrl: 'http://localhost:5002', voice: 'en_US-amy-low'},
  deepgram: {apiKey: ''},
  assemblyAi: {apiKey: ''},
  vosk: {baseUrl: 'http://localhost:8009'},
  fasterWhisper: {baseUrl: 'http://localhost:8010'},
  whatsApp: {apiKey: '', phoneId: ''},
  twilio: {apiKey: '', sid: '', from: ''},
  matrix: {apiKey: '', baseUrl: 'https://matrix.org'},
  mattermost: {apiKey: '', baseUrl: 'http://localhost:8065'},
  pinecone: {apiKey: '', baseUrl: ''},
  weaviate: {apiKey: '', baseUrl: ''},
  faiss: {baseUrl: 'http://localhost:8900'},
  qdrant: {baseUrl: 'http://localhost:6333'},
  notion: {apiKey: '', dbId: ''},
  jsonMemory: {baseUrl: 'http://localhost:8787'},
  openAi: {apiKey: '', model: 'gpt-4o-mini'},
  zapier: {apiKey: ''},
};

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() private isSettingsOpen = false;
  @state() isInputMuted = false;
  @state() isOutputMuted = false;
  @state() private outputVolume = 1;

  @state() private preferredTtsProvider = 'cartesia';
  @state() private preferredSttProvider = 'deepgram';
  @state() private preferredMsgProvider = 'whatsapp-business';
  @state() private preferredRagProvider = 'pinecone';
  @state() private preferredMemProvider = 'redis-memory';

  @state() private selectedAiVoice = 'Kore';
  @state() private activeAiVoice = 'Kore';

  @state() private mcpConfig: McpConfig = initialMcpConfig;
  private mcpConfigKey = 'gdm-mcp-config';

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
    // Female Voices
    'Aoede': 'Aoede (Female)',
    'Thelxiepeia': 'Thelxiepeia (Female)',
    'Peisinoe': 'Peisinoe (Female)',
    'Aglaope': 'Aglaope (Female)',
    'Kore': 'Kore (Female)',
    'Ligeia': 'Ligeia (Female)',
    'Molpe': 'Molpe (Female)',
    'Parthenope': 'Parthenope (Female)',
    'Leucosia': 'Leucosia (Female)',
    'en-US-Standard-C': 'Standard C (Female)',
    'en-US-Standard-E': 'Standard E (Female)',
    // Male Voices
    'Achelous': 'Achelous (Male)',
    'en-US-Standard-A': 'Standard A (Male)',
    'en-US-Standard-B': 'Standard B (Male)',
    'en-US-Standard-D': 'Standard D (Male)',
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
      max-width: 600px;
      max-height: 90vh;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
    }

    .settings-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
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

    .settings-modal-body {
      overflow-y: auto;
      padding-right: 12px;
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

    .setting-description,
    .setting-description-small {
      font-size: 0.85rem;
      color: #9ca3af;
      margin-top: -12px;
      margin-bottom: 16px;
      max-width: 90%;
    }

    .setting-description-small {
      font-size: 0.8rem;
      color: #6b7280;
      margin-top: -8px;
    }

    .setting {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      gap: 16px;
    }

    .setting label,
    .setting > span {
      flex-shrink: 0;
      color: #d1d5db;
    }

    .setting input,
    .setting select {
      background-color: #374151;
      color: white;
      border: 1px solid #4b5563;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 0.9rem;
      width: 100%;
      box-sizing: border-box;
    }

    .setting input:focus,
    .setting select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px #1e40af;
    }

    .setting input[type='range'] {
      -webkit-appearance: none;
      appearance: none;
      height: 8px;
      background: #4b5563;
      border-radius: 4px;
      outline: none;
      padding: 0;
      border: none;
      transition: background 0.2s;
    }

    .setting input[type='range']:focus {
      box-shadow: none;
    }

    .setting input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      background: #d1d5db;
      border-radius: 50%;
      cursor: pointer;
      transition: background 0.2s;
    }

    .setting input[type='range']::-webkit-slider-thumb:hover {
      background: #ffffff;
    }

    .setting input[type='range']::-moz-range-thumb {
      width: 20px;
      height: 20px;
      background: #d1d5db;
      border-radius: 50%;
      cursor: pointer;
      border: none;
      transition: background 0.2s;
    }

    .setting input[type='range']::-moz-range-thumb:hover {
      background: #ffffff;
    }

    .mcp-config-section details {
      border: 1px solid #374151;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .mcp-config-section summary {
      padding: 12px;
      cursor: pointer;
      background-color: #2b3a4f;
      font-weight: 500;
    }

    .mcp-config-section summary:hover {
      background-color: #374151;
    }

    .mcp-config-section .details-content {
      padding: 0 16px 16px 16px;
      background-color: #1f2937;
    }

    .settings-modal-footer {
      flex-shrink: 0;
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
      gap: 20px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 52px;
        height: 52px;
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

      button.record-button {
        width: 64px;
        height: 64px;
        border-radius: 50%;
      }
    }
  `;

  constructor() {
    super();
    const savedConfig = localStorage.getItem(this.mcpConfigKey);
    if (savedConfig) {
      try {
        this.mcpConfig = {
          ...initialMcpConfig,
          ...JSON.parse(savedConfig),
        };
      } catch (e) {
        console.error('Failed to parse MCP config from localStorage', e);
      }
    }
    initializeProviders(this.mcpConfig);
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
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';
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
                      `MCP: RAG.search(['${this.preferredRagProvider}'], { queryText: '${args.query}' })`,
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
                      `MCP: Memory.note(['${this.preferredMemProvider}'], { scope: 'user', key: '${args.key}', value: '${args.value}' })`,
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
                // FIX: The property for tool responses should be `toolResponses`.
                this.session.sendRealtimeInput({
                  toolResponses: [
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
                // FIX: The property for tool responses should be `toolResponses`.
                this.session.sendRealtimeInput({
                  toolResponses: [
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
            // FIX: The property for the end of speech timeout should be `endOfSpeechTimeout`.
            endOfSpeechTimeout: 3000, // Wait for 3 seconds of silence before responding.
            // languageCode: 'en-GB'
            interruptionConfig: {
              holdDurationMs: 500, // Wait 500ms of user speech before interrupting.
            },
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
    localStorage.setItem(this.mcpConfigKey, JSON.stringify(this.mcpConfig));
    initializeProviders(this.mcpConfig);
    this.isSettingsOpen = false;
  }

  private handleConfigChange(provider: keyof McpConfig, field: string, value: string) {
    this.mcpConfig = {
      ...this.mcpConfig,
      [provider]: {
        ...(this.mcpConfig[provider] as any),
        [field]: value,
      },
    };
  }

  private toggleInputMute() {
    this.isInputMuted = !this.isInputMuted;
    this.inputNode.gain.value = this.isInputMuted ? 0 : 1;
  }

  private handleVolumeChange(e: Event) {
    const newVolume = parseFloat((e.target as HTMLInputElement).value);
    this.outputVolume = newVolume;
    // Moving the slider always affects the live volume and unmutes if necessary
    this.outputNode.gain.value = newVolume;
    this.isOutputMuted = newVolume === 0;
  }

  private toggleOutputMute() {
    this.isOutputMuted = !this.isOutputMuted;
    if (this.isOutputMuted) {
      // Mute: set gain to 0, but preserve outputVolume
      this.outputNode.gain.value = 0;
    } else {
      // Unmute: restore volume. If it was 0, set to a default.
      if (this.outputVolume === 0) {
        this.outputVolume = 0.75;
      }
      this.outputNode.gain.value = this.outputVolume;
    }
  }

  private transcribeFromFile() {
    this.shadowRoot?.querySelector<HTMLInputElement>('#file-input')?.click();
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  private async handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    this.updateStatus('Transcribing audio file...');

    try {
      const base64String = await this.readFileAsBase64(file);
      const result = await Voice.transcribe([this.preferredSttProvider], {
        audioBytesBase64: base64String,
      });

      if (result && result.text) {
        this.updateStatus(`Transcription: "${result.text}"`);
        this.session.sendClientContent({
          turns: [result.text],
        });
      } else {
        this.updateError('Transcription failed: Empty result.');
      }
    } catch (error) {
      this.updateError(`Error: ${(error as Error).message}`);
    } finally {
      input.value = '';
    }
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
                    <h3>AI Voice Configuration</h3>
                    <p class="setting-description">
                      Controls Beatrice's primary voice, generated in real-time
                      by Gemini.
                    </p>
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
                    <div class="setting">
                      <span>Output Volume</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        .value=${String(this.outputVolume)}
                        @input=${this.handleVolumeChange}
                        aria-label="Output volume control"
                      />
                    </div>

                    <h3>Service Preferences (MCP)</h3>
                    <p class="setting-description">
                      Select preferred third-party providers for functions like
                      messaging or knowledge search.
                    </p>
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
                    <p class="setting-description-small">
                      Note: This is for tool functions that might need to speak,
                      not for Beatrice's main voice.
                    </p>
                    <div class="setting">
                      <span>Speech-to-Text (STT)</span>
                      <select
                        .value=${this.preferredSttProvider}
                        @change=${(e: Event) =>
                          (this.preferredSttProvider = (
                            e.target as HTMLSelectElement
                          ).value)}>
                        <option value="deepgram">Deepgram (Paid)</option>
                        <option value="assemblyai">AssemblyAI (Paid)</option>
                        <option value="faster-whisper">
                          FasterWhisper (OSS)
                        </option>
                        <option value="vosk">Vosk (OSS)</option>
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
                    <div class="setting">
                      <span>Knowledge Base (RAG)</span>
                      <select
                        .value=${this.preferredRagProvider}
                        @change=${(e: Event) =>
                          (this.preferredRagProvider = (
                            e.target as HTMLSelectElement
                          ).value)}>
                        <option value="pinecone">Pinecone (Paid)</option>
                        <option value="weaviate-cloud">
                          Weaviate Cloud (Paid)
                        </option>
                        <option value="faiss">FAISS (OSS)</option>
                        <option value="qdrant">Qdrant (OSS)</option>
                      </select>
                    </div>
                    <div class="setting">
                      <span>Memory</span>
                      <select
                        .value=${this.preferredMemProvider}
                        @change=${(e: Event) =>
                          (this.preferredMemProvider = (
                            e.target as HTMLSelectElement
                          ).value)}>
                        <option value="redis-memory">Redis Cloud (Paid)</option>
                        <option value="notion-memory">Notion (Paid)</option>
                        <option value="sqlite-memory">SQLite (OSS)</option>
                        <option value="json-memory">JSON File (OSS)</option>
                      </select>
                    </div>

                    <h3>MCP Provider Configuration</h3>
                    <p class="setting-description">
                      Enter API keys and other details for the selected
                      third-party providers.
                    </p>
                    <div class="mcp-config-section">
                      <details>
                        <summary>TTS Providers</summary>
                        <div class="details-content">
                          <p class="setting-description-small" style="margin-top: 8px; margin-bottom: 16px; color: #9ca3af; max-width: 100%;">
                            Text-to-Speech engines convert text into spoken audio, used by tools that need to generate voice output.
                          </p>
                          <div class="setting">
                            <label for="cart-key">Cartesia API Key</label>
                            <input id="cart-key" type="password" .value=${this.mcpConfig.cartesia.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('cartesia', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="el-key">ElevenLabs API Key</label>
                            <input id="el-key" type="password" .value=${this.mcpConfig.elevenLabs.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('elevenLabs', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="el-model">ElevenLabs Model ID</label>
                            <input id="el-model" type="text" .value=${this.mcpConfig.elevenLabs.modelId} @input=${(e: InputEvent) => this.handleConfigChange('elevenLabs', 'modelId', (e.target as HTMLInputElement).value)}>
                          </div>
                           <div class="setting">
                            <label for="coqui-url">Coqui XTTS URL</label>
                            <input id="coqui-url" type="text" .value=${this.mcpConfig.coquiXtps.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('coquiXtps', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., http://localhost:8020">
                          </div>
                          <div class="setting">
                            <label for="piper-url">Piper URL</label>
                            <input id="piper-url" type="text" .value=${this.mcpConfig.piper.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('piper', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., http://localhost:5002">
                          </div>
                        </div>
                      </details>
                      <details>
                        <summary>STT Providers</summary>
                        <div class="details-content">
                          <p class="setting-description-small" style="margin-top: 8px; margin-bottom: 16px; color: #9ca3af; max-width: 100%;">
                            Speech-to-Text services transcribe spoken audio into written text, essential for understanding voice commands.
                          </p>
                          <div class="setting">
                            <label for="dg-key">Deepgram API Key</label>
                            <input id="dg-key" type="password" .value=${this.mcpConfig.deepgram.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('deepgram', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="as-key">AssemblyAI API Key</label>
                            <input id="as-key" type="password" .value=${this.mcpConfig.assemblyAi.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('assemblyAi', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                           <div class="setting">
                            <label for="fw-url">FasterWhisper URL</label>
                            <input id="fw-url" type="text" .value=${this.mcpConfig.fasterWhisper.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('fasterWhisper', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., http://localhost:8010">
                          </div>
                           <div class="setting">
                            <label for="vosk-url">Vosk URL</label>
                            <input id="vosk-url" type="text" .value=${this.mcpConfig.vosk.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('vosk', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., http://localhost:8009">
                          </div>
                        </div>
                      </details>
                       <details>
                        <summary>Messaging Providers</summary>
                        <div class="details-content">
                           <p class="setting-description-small" style="margin-top: 8px; margin-bottom: 16px; color: #9ca3af; max-width: 100%;">
                            Connect to platforms like WhatsApp or Twilio, allowing Beatrice to send messages on your behalf.
                          </p>
                          <div class="setting">
                            <label for="wa-key">WhatsApp API Key</label>
                            <input id="wa-key" type="password" .value=${this.mcpConfig.whatsApp.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('whatsApp', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                           <div class="setting">
                            <label for="wa-phone">WhatsApp Phone ID</label>
                            <input id="wa-phone" type="text" .value=${this.mcpConfig.whatsApp.phoneId} @input=${(e: InputEvent) => this.handleConfigChange('whatsApp', 'phoneId', (e.target as HTMLInputElement).value)}>
                          </div>
                           <div class="setting">
                            <label for="tw-key">Twilio Auth Token</label>
                            <input id="tw-key" type="password" .value=${this.mcpConfig.twilio.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('twilio', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="tw-sid">Twilio SID</label>
                            <input id="tw-sid" type="text" .value=${this.mcpConfig.twilio.sid} @input=${(e: InputEvent) => this.handleConfigChange('twilio', 'sid', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="tw-from">Twilio From #</label>
                            <input id="tw-from" type="text" .value=${this.mcpConfig.twilio.from} @input=${(e: InputEvent) => this.handleConfigChange('twilio', 'from', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="mx-key">Matrix Access Token</label>
                            <input id="mx-key" type="password" .value=${this.mcpConfig.matrix.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('matrix', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="mx-url">Matrix Base URL</label>
                            <input id="mx-url" type="text" .value=${this.mcpConfig.matrix.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('matrix', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., https://matrix.org">
                          </div>
                          <div class="setting">
                            <label for="mm-key">Mattermost Access Token</label>
                            <input id="mm-key" type="password" .value=${this.mcpConfig.mattermost.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('mattermost', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="mm-url">Mattermost Base URL</label>
                            <input id="mm-url" type="text" .value=${this.mcpConfig.mattermost.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('mattermost', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., http://localhost:8065">
                          </div>
                        </div>
                      </details>
                      <details>
                        <summary>RAG Providers</summary>
                        <div class="details-content">
                          <p class="setting-description-small" style="margin-top: 8px; margin-bottom: 16px; color: #9ca3af; max-width: 100%;">
                            Retrieval-Augmented Generation (RAG) providers give Beatrice a knowledge base to search for specific, factual information.
                          </p>
                          <div class="setting">
                            <label for="pc-key">Pinecone API Key</label>
                            <input id="pc-key" type="password" .value=${this.mcpConfig.pinecone.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('pinecone', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                           <div class="setting">
                            <label for="pc-url">Pinecone URL</label>
                            <input id="pc-url" type="text" .value=${this.mcpConfig.pinecone.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('pinecone', 'baseUrl', (e.target as HTMLInputElement).value)}>
                          </div>
                           <div class="setting">
                            <label for="wv-key">Weaviate API Key</label>
                            <input id="wv-key" type="password" .value=${this.mcpConfig.weaviate.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('weaviate', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                           <div class="setting">
                            <label for="wv-url">Weaviate URL</label>
                            <input id="wv-url" type="text" .value=${this.mcpConfig.weaviate.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('weaviate', 'baseUrl', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="faiss-url">FAISS URL</label>
                            <input id="faiss-url" type="text" .value=${this.mcpConfig.faiss.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('faiss', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., http://localhost:8900">
                          </div>
                          <div class="setting">
                            <label for="qdrant-url">Qdrant URL</label>
                            <input id="qdrant-url" type="text" .value=${this.mcpConfig.qdrant.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('qdrant', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., http://localhost:6333">
                          </div>
                        </div>
                      </details>
                      <details>
                        <summary>Memory Providers</summary>
                        <div class="details-content">
                          <p class="setting-description-small" style="margin-top: 8px; margin-bottom: 16px; color: #9ca3af; max-width: 100%;">
                            These services provide Beatrice with a long-term memory to recall facts, preferences, and past conversations.
                          </p>
                           <div class="setting">
                            <label for="no-key">Notion API Key</label>
                            <input id="no-key" type="password" .value=${this.mcpConfig.notion.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('notion', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                           <div class="setting">
                            <label for="no-db">Notion DB ID</label>
                            <input id="no-db" type="text" .value=${this.mcpConfig.notion.dbId} @input=${(e: InputEvent) => this.handleConfigChange('notion', 'dbId', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="json-url">JSON Memory URL</label>
                            <input id="json-url" type="text" .value=${this.mcpConfig.jsonMemory.baseUrl} @input=${(e: InputEvent) => this.handleConfigChange('jsonMemory', 'baseUrl', (e.target as HTMLInputElement).value)} placeholder="e.g., http://localhost:8787">
                          </div>
                        </div>
                      </details>
                      <details>
                        <summary>Tool/Function Providers</summary>
                        <div class="details-content">
                          <p class="setting-description-small" style="margin-top: 8px; margin-bottom: 16px; color: #9ca3af; max-width: 100%;">
                            Connect to external services like Zapier or other AI models to dramatically extend Beatrice's capabilities.
                          </p>
                           <div class="setting">
                            <label for="zap-key">Zapier API Key</label>
                            <input id="zap-key" type="password" .value=${this.mcpConfig.zapier.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('zapier', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="openai-key">OpenAI API Key</label>
                            <input id="openai-key" type="password" .value=${this.mcpConfig.openAi.apiKey} @input=${(e: InputEvent) => this.handleConfigChange('openAi', 'apiKey', (e.target as HTMLInputElement).value)}>
                          </div>
                          <div class="setting">
                            <label for="openai-model">OpenAI Model</label>
                            <input id="openai-model" type="text" .value=${this.mcpConfig.openAi.model} @input=${(e: InputEvent) => this.handleConfigChange('openAi', 'model', (e.target as HTMLInputElement).value)}>
                          </div>
                        </div>
                      </details>
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
                  width="26"
                  height="26"
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
                  width="26"
                  height="26"
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
            class="record-button"
            @click=${this.isRecording ? this.stopRecording : this.startRecording}
            aria-label=${this.isRecording ? 'Stop connection' : 'Start connection'}
          >
           ${this.isRecording
              ? html`
                <svg
                  viewBox="0 0 100 100"
                  width="26px"
                  height="26px"
                  fill="#ffffff"
                  xmlns="http://www.w3.org/2000/svg">
                  <rect x="0" y="0" width="100" height="100" rx="15" />
                </svg>`
              : html`
                <svg
                  viewBox="0 0 100 100"
                  width="26px"
                  height="26px"
                  fill="#c80000"
                  xmlns="http://www.w3.org/2000/svg">
                  <circle cx="50" cy="50" r="50" />
                </svg>`
            }
          </button>
          <button
            @click=${this.toggleOutputMute}
            class=${classMap({muted: this.isOutputMuted})}
            aria-label=${this.isOutputMuted
              ? 'Unmute speaker'
              : 'Mute speaker'}>
            ${this.isOutputMuted
              ? html`<svg
                  width="26"
                  height="26"
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
                  width="26"
                  height="26"
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
        </div>

        <div id="status">${this.error || this.status}</div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}