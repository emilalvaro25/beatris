/**
 * MCP-Compatible Orchestrator Template — Extended
 * Adds: DB, Storage, RAG (Vector), Memory Save, and generic Tools API/function calls.
 * Style: TypeScript, framework-agnostic, plug-and-play providers for MCP servers.
 *
 * Notes:
 * - Keep secrets in env/secret vault; strings inline here are placeholders.
 * - Each category exposes 2 paid + 2 open-source providers (swap as needed).
 */

/* -------------------------------- 1) Types & Contracts -------------------------------- */

type Lang = 'auto' | 'en-US' | 'nl-BE' | 'fr-FR' | string;
type AudioFmt = 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | string;
type Secret = string;
type URLString = string;

export type McpConfig = {
  cartesia: {apiKey: string};
  elevenLabs: {apiKey: string; modelId: string};
  coquiXtps: {baseUrl: string};
  piper: {baseUrl: string; voice: string};
  deepgram: {apiKey: string};
  assemblyAi: {apiKey: string};
  vosk: {baseUrl: string};
  fasterWhisper: {baseUrl: string};
  whatsApp: {apiKey: string; phoneId: string};
  twilio: {apiKey: string; sid: string; from: string};
  matrix: {apiKey: string; baseUrl: string};
  mattermost: {apiKey: string; baseUrl: string};
  pinecone: {apiKey: string; baseUrl: string};
  weaviate: {apiKey: string; baseUrl: string};
  faiss: {baseUrl: string};
  qdrant: {baseUrl: string};
  notion: {apiKey: string; dbId: string};
  jsonMemory: {baseUrl: string};
  openAi: {apiKey: string; model: string};
  zapier: {apiKey: string};
};

namespace Contract {
  /* Voice / STT */
  export type VoiceCloneIn = {
    audioUrls?: URLString[];
    audioBase64s?: string[];
    voiceName?: string;
  };
  export type VoiceCloneOut = {voice_id: string; meta?: any};
  export type SpeakIn = {
    text: string;
    voice_id?: string;
    voice_name?: string;
    lang?: Lang;
    style?: string;
    speed?: number;
    format?: AudioFmt;
  };
  export type SpeakOut = {
    audioUrl?: URLString;
    audioBytesBase64?: string;
    durationSec?: number;
    meta?: any;
  };
  export type STTIn = {
    audioUrl?: URLString;
    audioBytesBase64?: string;
    lang?: Lang;
    diarize?: boolean;
    timestamps?: boolean;
  };
  export type STTOut = {
    text: string;
    words?: Array<{start: number; end: number; word: string}>;
    meta?: any;
  };

  /* Messaging */
  export type MsgIn = {target: string; body: string; meta?: any};
  export type MsgOut = {
    id?: string;
    status: 'queued' | 'sent' | 'failed';
    raw?: any;
  };

  /* DB (SQL/NoSQL) */
  export type DBQueryIn = {
    sql?: string;
    params?: any[];
    collection?: string;
    docId?: string;
    filter?: any;
    data?: any;
  };
  export type DBQueryOut = {
    rows?: any[];
    rowCount?: number;
    ack?: boolean;
    meta?: any;
  };

  /* Storage */
  export type StoragePutIn = {
    path: string;
    bytesBase64?: string;
    urlFetch?: URLString;
    contentType?: string;
    public?: boolean;
  };
  export type StoragePutOut = {
    path: string;
    url?: URLString;
    etag?: string;
    size?: number;
    meta?: any;
  };
  export type StorageGetIn = {path: string; asUrl?: boolean};
  export type StorageGetOut = {
    bytesBase64?: string;
    url?: URLString;
    contentType?: string;
    size?: number;
    meta?: any;
  };

  /* RAG (Vectors) */
  export type EmbedIn = {texts: string[]; model?: string};
  export type EmbedOut = {vectors: number[][]; dim: number; meta?: any};
  export type UpsertIn = {
    ids: string[];
    vectors: number[][];
    metadata?: any[];
    namespace?: string;
  };
  export type UpsertOut = {upserted: number; meta?: any};
  export type SearchIn = {
    queryVector?: number[];
    queryText?: string;
    topK?: number;
    filter?: any;
    namespace?: string;
  };
  export type SearchOut = {
    matches: Array<{id: string; score: number; metadata?: any}>;
    meta?: any;
  };

  /* Memory (agent scratchpad / long-term) */
  export type MemoryNoteIn = {
    scope: 'user' | 'session' | 'global';
    key: string;
    value: any;
    ttlSec?: number;
  };
  export type MemoryNoteOut = {ok: boolean; meta?: any};
  export type MemoryReadIn = {scope: 'user' | 'session' | 'global'; key: string};
  export type MemoryReadOut = {value?: any; found: boolean; meta?: any};

  /* Tools API / Function Calls */
  export type ToolCallIn = {
    name: string;
    args: any;
    endpoint?: string;
    authHeader?: string;
    method?: 'GET' | 'POST';
  };
  export type ToolCallOut = {result?: any; raw?: any; meta?: any};
}

/* -------------------------------- 2) Provider Interface -------------------------------- */

type ProviderKind =
  | 'stt'
  | 'tts'
  | 'voice-clone'
  | 'messaging'
  | 'db'
  | 'storage'
  | 'rag'
  | 'memory'
  | 'tools';

interface Provider {
  name: string;
  kind: ProviderKind | ProviderKind[];
  isOpenSource: boolean;
  defaults?: Record<string, any>;
  /* Voice */
  voiceClone?(input: Contract.VoiceCloneIn): Promise<Contract.VoiceCloneOut>;
  speak?(input: Contract.SpeakIn): Promise<Contract.SpeakOut>;
  transcribe?(input: Contract.STTIn): Promise<Contract.STTOut>;
  /* Messaging */
  sendMessage?(input: Contract.MsgIn): Promise<Contract.MsgOut>;
  /* DB */
  dbExec?(input: Contract.DBQueryIn): Promise<Contract.DBQueryOut>;
  /* Storage */
  storagePut?(input: Contract.StoragePutIn): Promise<Contract.StoragePutOut>;
  storageGet?(input: Contract.StorageGetIn): Promise<Contract.StorageGetOut>;
  /* RAG */
  embed?(input: Contract.EmbedIn): Promise<Contract.EmbedOut>;
  upsert?(input: Contract.UpsertIn): Promise<Contract.UpsertOut>;
  search?(input: Contract.SearchIn): Promise<Contract.SearchOut>;
  /* Memory */
  memoryNote?(input: Contract.MemoryNoteIn): Promise<Contract.MemoryNoteOut>;
  memoryRead?(input: Contract.MemoryReadIn): Promise<Contract.MemoryReadOut>;
  /* Tools / Functions */
  toolCall?(input: Contract.ToolCallIn): Promise<Contract.ToolCallOut>;
}

type ProviderConfig = {
  baseURL?: string;
  apiKey?: Secret;
  region?: string;
  db?: any;
  extra?: Record<string, any>;
};

/* -------------------------------- 3) Helpers -------------------------------- */

async function httpJSON(
  url: string,
  opts: RequestInit & {expect?: 'json' | 'arraybuffer'} = {},
) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `HTTP ${res.status} ${res.statusText} :: ${body.slice(0, 500)}`,
    );
  }
  if (opts.expect === 'arraybuffer') return await res.arrayBuffer();
  return await res.json().catch(() => ({}));
}
function b64(buf: ArrayBuffer) {
  const u = new Uint8Array(buf);
  let s = '';
  u.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s);
}

/* -------------------------------- 4) Voice / STT Providers (2 paid + 2 OSS each) -------------------------------- */

/* Paid: Cartesia (clone + tts) */
function Cartesia(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Bearer ${cfg.apiKey}`};
  return {
    name: 'cartesia',
    kind: ['voice-clone', 'tts'],
    isOpenSource: false,
    async voiceClone(i) {
      const body = {
        samples: [...(i.audioUrls || []), ...(i.audioBase64s || [])],
        name: i.voiceName,
      };
      const j = await httpJSON(
        `${cfg.baseURL || 'https://api.cartesia.ai'}/v1/voices`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify(body),
        },
      );
      return {voice_id: j.id || j.voice_id, meta: j};
    },
    async speak(i) {
      const body = {
        text: i.text,
        voice_id: i.voice_id,
        lang: i.lang,
        speed: i.speed,
        format: i.format || 'audio/mpeg',
      };
      const buf = (await httpJSON(
        `${cfg.baseURL || 'https://api.cartesia.ai'}/v1/tts`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify(body),
          expect: 'arraybuffer',
        },
      )) as ArrayBuffer;
      return {audioBytesBase64: b64(buf), meta: {provider: 'cartesia'}};
    },
  };
}

/* Paid: ElevenLabs (clone + tts) */
function ElevenLabs(cfg: ProviderConfig): Provider {
  const headers = {'xi-api-key': cfg.apiKey || ''};
  return {
    name: 'elevenlabs',
    kind: ['voice-clone', 'tts'],
    isOpenSource: false,
    async voiceClone(i) {
      const fd = new FormData();
      fd.append('name', i.voiceName || `beatrice-${Date.now()}`);
      (i.audioUrls || []).forEach((u) => fd.append('files', u));
      const j = await httpJSON(
        `${cfg.baseURL || 'https://api.elevenlabs.io'}/v1/voices/add`,
        {method: 'POST', headers, body: fd as any},
      );
      return {voice_id: j.voice_id || j.id, meta: j};
    },
    async speak(i) {
      const model_id = cfg.extra?.model_id || 'eleven_multilingual_v2';
      const buf = (await httpJSON(
        `${cfg.baseURL || 'https://api.elevenlabs.io'}/v1/text-to-speech/${
          i.voice_id
        }`,
        {
          method: 'POST',
          headers: {...headers, 'Content-Type': 'application/json'},
          body: JSON.stringify({text: i.text, model_id}),
          expect: 'arraybuffer',
        },
      )) as ArrayBuffer;
      return {
        audioBytesBase64: b64(buf),
        meta: {provider: 'elevenlabs', model_id},
      };
    },
  };
}

/* OSS: Coqui XTTS (reference-based cloning per request) */
function CoquiXTTS(cfg: ProviderConfig): Provider {
  return {
    name: 'coqui-xtts',
    kind: ['tts', 'voice-clone'],
    isOpenSource: true,
    async voiceClone(i) {
      return {
        voice_id: `ref:${(i.audioUrls || i.audioBase64s || ['sample']).join(
          ',',
        )}`,
      };
    },
    async speak(i) {
      const body = {
        text: i.text,
        lang: i.lang || 'auto',
        reference: i.voice_id?.startsWith('ref:')
          ? i.voice_id.slice(4)
          : undefined,
      };
      const buf = (await httpJSON(
        `${cfg.baseURL || 'http://localhost:8020'}/tts`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
          expect: 'arraybuffer',
        },
      )) as ArrayBuffer;
      return {audioBytesBase64: b64(buf), meta: {provider: 'coqui-xtts'}};
    },
  };
}

/* OSS: Piper (offline TTS) */
function Piper(cfg: ProviderConfig): Provider {
  return {
    name: 'piper',
    kind: 'tts',
    isOpenSource: true,
    async speak(i) {
      const body = {
        text: i.text,
        voice: i.voice_name || cfg.extra?.voice || 'en_US-amy-low',
        length_scale: i.speed || 1.0,
      };
      const buf = (await httpJSON(
        `${cfg.baseURL || 'http://localhost:5002'}/api/tts`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
          expect: 'arraybuffer',
        },
      )) as ArrayBuffer;
      return {audioBytesBase64: b64(buf), meta: {provider: 'piper'}};
    },
  };
}

/* Paid STT: Deepgram */
function Deepgram(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Token ${cfg.apiKey}`};
  return {
    name: 'deepgram',
    kind: 'stt',
    isOpenSource: false,
    async transcribe(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'https://api.deepgram.com'}/v1/listen`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify({
            url: i.audioUrl,
            model: 'nova-2-general',
            smart_format: true,
            diarize: !!i.diarize,
          }),
        },
      );
      const text =
        j.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      return {text, meta: j};
    },
  };
}

/* Paid STT: AssemblyAI */
function AssemblyAI(cfg: ProviderConfig): Provider {
  const auth = {Authorization: cfg.apiKey || ''};
  return {
    name: 'assemblyai',
    kind: 'stt',
    isOpenSource: false,
    async transcribe(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'https://api.assemblyai.com'}/v2/transcript`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify({
            audio_url: i.audioUrl,
            speaker_labels: !!i.diarize,
          }),
        },
      );
      return {text: j.text || '', meta: j};
    },
  };
}

/* OSS STT: Vosk */
function Vosk(cfg: ProviderConfig): Provider {
  return {
    name: 'vosk',
    kind: 'stt',
    isOpenSource: true,
    async transcribe(i) {
      const j = await httpJSON(`${cfg.baseURL || 'http://localhost:8009'}/stt`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({audioUrl: i.audioUrl, lang: i.lang}),
      });
      return {text: j.text || '', meta: j};
    },
  };
}

/* OSS STT: FasterWhisper */
function FasterWhisper(cfg: ProviderConfig): Provider {
  return {
    name: 'faster-whisper',
    kind: 'stt',
    isOpenSource: true,
    async transcribe(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:8010'}/transcribe`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({audioUrl: i.audioUrl, language: i.lang}),
        },
      );
      return {text: j.text || '', meta: j};
    },
  };
}

/* -------------------------------- 5) Messaging Providers (2 paid + 2 OSS) -------------------------------- */

function WhatsAppBusiness(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Bearer ${cfg.apiKey}`};
  return {
    name: 'whatsapp-business',
    kind: 'messaging',
    isOpenSource: false,
    async sendMessage(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'https://graph.facebook.com/v19.0'}/${
          cfg.extra?.phone_id
        }/messages`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: i.target,
            type: 'text',
            text: {body: i.body},
          }),
        },
      );
      return {id: j.messages?.[0]?.id, status: 'sent', raw: j};
    },
  };
}

function Twilio(cfg: ProviderConfig): Provider {
  const basic = 'Basic ' + btoa(`${cfg.extra?.sid}:${cfg.apiKey}`);
  return {
    name: 'twilio',
    kind: 'messaging',
    isOpenSource: false,
    async sendMessage(i) {
      const form = new URLSearchParams({
        To: i.target,
        From: cfg.extra?.from || '',
        Body: i.body,
      });
      const j = await httpJSON(
        `${
          cfg.baseURL ||
          `https://api.twilio.com/2010-04-01/Accounts/${cfg.extra?.sid}`
        }/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: basic,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form as any,
        },
      );
      return {id: j.sid, status: 'sent', raw: j};
    },
  };
}

function Matrix(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Bearer ${cfg.apiKey}`};
  return {
    name: 'matrix',
    kind: 'messaging',
    isOpenSource: true,
    async sendMessage(i) {
      const txn = Date.now().toString();
      const j = await httpJSON(
        `${
          cfg.baseURL || 'https://matrix.local'
        }/_matrix/client/v3/rooms/${encodeURIComponent(
          i.target,
        )}/send/m.room.message/${txn}`,
        {
          method: 'PUT',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify({msgtype: 'm.text', body: i.body}),
        },
      );
      return {id: j.event_id, status: 'sent', raw: j};
    },
  };
}

function Mattermost(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Bearer ${cfg.apiKey}`};
  return {
    name: 'mattermost',
    kind: 'messaging',
    isOpenSource: true,
    async sendMessage(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:8065'}/api/v4/posts`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify({channel_id: i.target, message: i.body}),
        },
      );
      return {id: j.id, status: 'sent', raw: j};
    },
  };
}

/* -------------------------------- 6) DB Providers (2 paid + 2 OSS) -------------------------------- */

/* Paid: Google Firestore */
function Firestore(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Bearer ${cfg.apiKey}`};
  return {
    name: 'firestore',
    kind: 'db',
    isOpenSource: false,
    async dbExec(i) {
      if (i.collection && i.docId && i.data) {
        const j = await httpJSON(
          `${cfg.baseURL}/v1/projects/${cfg.extra?.project}/databases/(default)/documents/${i.collection}/${i.docId}`,
          {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json', ...auth},
            body: JSON.stringify({fields: i.data}),
          },
        );
        return {ack: true, meta: j};
      }
      // simple query stub
      return {rows: [], rowCount: 0};
    },
  };
}

/* Paid: Neon Postgres (or any hosted PG) */
function PostgresNeon(cfg: ProviderConfig): Provider {
  // Expect cfg.db to be a ready-to-use client (e.g., neon serverless client)
  return {
    name: 'postgres-neon',
    kind: 'db',
    isOpenSource: false,
    async dbExec(i) {
      if (!i.sql) return {rows: [], rowCount: 0};
      const res = await (cfg.db as any).query(i.sql, i.params || []);
      return {rows: res.rows, rowCount: res.rowCount, meta: res};
    },
  };
}

/* OSS: SQLite (better-sqlite3 or libsql) */
function SQLite(cfg: ProviderConfig): Provider {
  return {
    name: 'sqlite',
    kind: 'db',
    isOpenSource: true,
    async dbExec(i) {
      if (!i.sql) return {rows: [], rowCount: 0};
      const stmt = (cfg.db as any).prepare(i.sql);
      if (i.sql.trim().toLowerCase().startsWith('select')) {
        const rows = stmt.all(...(i.params || []));
        return {rows, rowCount: rows.length};
      } else {
        const info = stmt.run(...(i.params || []));
        return {ack: true, rowCount: info.changes};
      }
    },
  };
}

/* OSS: Postgres (self-hosted) */
function PostgresLocal(cfg: ProviderConfig): Provider {
  return {
    name: 'postgres-local',
    kind: 'db',
    isOpenSource: true,
    async dbExec(i) {
      if (!i.sql) return {rows: [], rowCount: 0};
      const res = await (cfg.db as any).query(i.sql, i.params || []);
      return {rows: res.rows, rowCount: res.rowCount, meta: res};
    },
  };
}

/* -------------------------------- 7) Storage Providers (2 paid + 2 OSS) -------------------------------- */

/* Paid: AWS S3 */
function S3(cfg: ProviderConfig): Provider {
  return {
    name: 's3',
    kind: 'storage',
    isOpenSource: false,
    async storagePut(i) {
      // Assume a signed endpoint or gateway in baseURL for simplicity
      const j = await httpJSON(`${cfg.baseURL}/put`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(i),
      });
      return {path: i.path, url: j.url, etag: j.etag, size: j.size, meta: j};
    },
    async storageGet(i) {
      const j = await httpJSON(
        `${cfg.baseURL}/get?path=${encodeURIComponent(i.path)}`,
        {
          headers: {Authorization: `Bearer ${cfg.apiKey}`},
        },
      );
      return {
        bytesBase64: j.bytesBase64,
        url: j.url,
        contentType: j.contentType,
        size: j.size,
        meta: j,
      };
    },
  };
}

/* Paid: Firebase Storage */
function FirebaseStorage(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Bearer ${cfg.apiKey}`};
  return {
    name: 'firebase-storage',
    kind: 'storage',
    isOpenSource: false,
    async storagePut(i) {
      const j = await httpJSON(
        `${cfg.baseURL}/upload?path=${encodeURIComponent(i.path)}&public=${!!i.public}`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify(i),
        },
      );
      return {path: i.path, url: j.url, size: j.size, meta: j};
    },
    async storageGet(i) {
      const j = await httpJSON(
        `${cfg.baseURL}/download?path=${encodeURIComponent(i.path)}`,
        {headers: {...auth}},
      );
      return {
        bytesBase64: j.bytesBase64,
        url: j.url,
        contentType: j.contentType,
        size: j.size,
        meta: j,
      };
    },
  };
}

/* OSS: MinIO (S3 compatible) */
function MinIO(cfg: ProviderConfig): Provider {
  return {
    name: 'minio',
    kind: 'storage',
    isOpenSource: true,
    async storagePut(i) {
      const j = await httpJSON(`${cfg.baseURL}/put`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(i),
      });
      return {path: i.path, url: j.url, etag: j.etag, size: j.size, meta: j};
    },
    async storageGet(i) {
      const j = await httpJSON(
        `${cfg.baseURL}/get?path=${encodeURIComponent(i.path)}`,
      );
      return {
        bytesBase64: j.bytesBase64,
        url: j.url,
        contentType: j.contentType,
        size: j.size,
        meta: j,
      };
    },
  };
}

/* OSS: Local FS */
function LocalFS(cfg: ProviderConfig): Provider {
  return {
    name: 'local-fs',
    kind: 'storage',
    isOpenSource: true,
    async storagePut(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:8787'}/fs/put`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(i),
        },
      );
      return {path: i.path, url: j.url, size: j.size, meta: j};
    },
    async storageGet(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:8787'}/fs/get?path=${encodeURIComponent(
          i.path,
        )}`,
      );
      return {
        bytesBase64: j.bytesBase64,
        url: j.url,
        contentType: j.contentType,
        size: j.size,
        meta: j,
      };
    },
  };
}

/* -------------------------------- 8) RAG Providers (2 paid + 2 OSS) -------------------------------- */

/* Paid: Pinecone */
function Pinecone(cfg: ProviderConfig): Provider {
  const auth = {'Api-Key': cfg.apiKey || ''};
  return {
    name: 'pinecone',
    kind: 'rag',
    isOpenSource: false,
    async embed(i) {
      // Pinecone doesn't offer embedding, this would call a separate service like OpenAI
      // This is a mock implementation detail.
      const j = { vectors: i.texts.map(() => Array(1536).fill(0.1)), dim: 1536 };
      return {vectors: j.vectors, dim: j.dim, meta: j};
    },
    async upsert(i) {
      const vectors = i.vectors.map((values, idx) => ({
        id: i.ids[idx],
        values,
        metadata: i.metadata?.[idx] || {}
      }));
      const j = await httpJSON(`${cfg.baseURL}/vectors/upsert`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...auth},
        body: JSON.stringify({ vectors, namespace: i.namespace }),
      });
      return {upserted: j.upsertedCount || i.ids.length, meta: j};
    },
    async search(i) {
      const j = await httpJSON(`${cfg.baseURL}/query`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...auth},
        body: JSON.stringify({ vector: i.queryVector, topK: i.topK, includeMetadata: true, namespace: i.namespace }),
      });
      return {matches: j.matches || [], meta: j};
    },
  };
}

/* Paid: Weaviate Cloud */
function WeaviateCloud(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Bearer ${cfg.apiKey}`};
  return {
    name: 'weaviate-cloud',
    kind: 'rag',
    isOpenSource: false,
    async embed(i) {
       const j = { vectors: i.texts.map(() => Array(1536).fill(0.1)), dim: 1536 };
       return {vectors: j.vectors, dim: j.dim, meta: j};
    },
    async upsert(i) {
      const j = await httpJSON(`${cfg.baseURL}/v1/batch/objects`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...auth},
        body: JSON.stringify({
          objects: i.ids.map((id, idx) => ({
            class: i.namespace || 'Document',
            properties: i.metadata?.[idx] || {},
            vector: i.vectors[idx],
            id
          }))
        }),
      });
      return {upserted: j.length, meta: j};
    },
    async search(i) {
      const j = await httpJSON(`${cfg.baseURL}/v1/graphql`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...auth},
        body: JSON.stringify({
          query: `{ Get { ${i.namespace || 'Document'}(nearVector: {vector: [${i.queryVector}]}) { _additional { id score } } } }`
        }),
      });
      const matches = j.data?.Get?.[i.namespace || 'Document']?.map( (res: any) => ({
        id: res._additional.id,
        score: res._additional.score
      })) || [];
      return {matches, meta: j};
    },
  };
}

/* OSS: FAISS (self-hosted gateway) */
function FAISS(cfg: ProviderConfig): Provider {
  return {
    name: 'faiss',
    kind: 'rag',
    isOpenSource: true,
    async embed(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:8900'}/embed`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(i),
        },
      );
      return {vectors: j.vectors, dim: j.dim, meta: j};
    },
    async upsert(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:8900'}/upsert`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(i),
        },
      );
      return {upserted: j.upserted || i.ids.length, meta: j};
    },
    async search(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:8900'}/query`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(i),
        },
      );
      return {matches: j.matches || [], meta: j};
    },
  };
}

/* OSS: Qdrant */
function Qdrant(cfg: ProviderConfig): Provider {
  return {
    name: 'qdrant',
    kind: 'rag',
    isOpenSource: true,
    async embed(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:6333'}/embed`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(i),
        },
      );
      return {vectors: j.vectors, dim: j.dim, meta: j};
    },
    async upsert(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:6333'}/upsert`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(i),
        },
      );
      return {upserted: j.upserted || i.ids.length, meta: j};
    },
    async search(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'http://localhost:6333'}/query`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(i),
        },
      );
      return {matches: j.matches || [], meta: j};
    },
  };
}

/* -------------------------------- 9) Memory Providers (2 paid + 2 OSS) -------------------------------- */

/* Paid: Notion (as long-term memory) */
function NotionMemory(cfg: ProviderConfig): Provider {
  const auth = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Notion-Version': '2022-06-28',
  };
  return {
    name: 'notion-memory',
    kind: 'memory',
    isOpenSource: false,
    async memoryNote(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'https://api.notion.com'}/v1/pages`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify({
            parent: {database_id: cfg.extra?.db},
            properties: {
              Key: {title: [{text: {content: `${i.scope}:${i.key}`}}]},
              Value: {
                rich_text: [
                  {text: {content: JSON.stringify(i.value).slice(0, 1900)}},
                ],
              },
            },
          }),
        },
      );
      return {ok: !!j.id, meta: j};
    },
    async memoryRead(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'https://api.notion.com'}/v1/databases/${
          cfg.extra?.db
        }/query`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify({
            filter: {property: 'Key', title: {equals: `${i.scope}:${i.key}`}},
          }),
        },
      );
      const page = (j.results as any)?.[0];
      const raw = page?.properties?.Value?.rich_text?.[0]?.plain_text;
      return {value: raw ? JSON.parse(raw) : undefined, found: !!page, meta: j};
    },
  };
}

/* Paid: Redis Cloud (TTL memories, sessions) */
function RedisMemory(cfg: ProviderConfig): Provider {
  const client = cfg.db; // ioredis or compatible
  return {
    name: 'redis-memory',
    kind: 'memory',
    isOpenSource: false,
    async memoryNote(i) {
      const k = `${i.scope}:${i.key}`;
      await (client as any).set(
        k,
        JSON.stringify(i.value),
        ...(i.ttlSec ? ['EX', i.ttlSec] : []),
      );
      return {ok: true};
    },
    async memoryRead(i) {
      const k = `${i.scope}:${i.key}`;
      const v = await (client as any).get(k);
      return {value: v ? JSON.parse(v) : undefined, found: !!v};
    },
  };
}

/* OSS: SQLite Memory */
function SQLiteMemory(cfg: ProviderConfig): Provider {
  // expects a table: memory(scope TEXT, key TEXT, value TEXT, PRIMARY KEY(scope,key))
  return {
    name: 'sqlite-memory',
    kind: 'memory',
    isOpenSource: true,
    async memoryNote(i) {
      (cfg.db as any)
        .prepare(
          'INSERT INTO memory(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value',
        )
        .run(i.scope, i.key, JSON.stringify(i.value));
      return {ok: true};
    },
    async memoryRead(i) {
      const row = (cfg.db as any)
        .prepare('SELECT value FROM memory WHERE scope=? AND key=?')
        .get(i.scope, i.key);
      return {value: row ? JSON.parse(row.value) : undefined, found: !!row};
    },
  };
}

/* OSS: Local JSON Memory (file-backed gateway) */
function JSONMemory(cfg: ProviderConfig): Provider {
  return {
    name: 'json-memory',
    kind: 'memory',
    isOpenSource: true,
    async memoryNote(i) {
      await httpJSON(`${cfg.baseURL || 'http://localhost:8787'}/mem/put`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(i),
      });
      return {ok: true};
    },
    async memoryRead(i) {
      const j = await httpJSON(
        `${
          cfg.baseURL || 'http://localhost:8787'
        }/mem/get?scope=${i.scope}&key=${encodeURIComponent(i.key)}`,
      );
      return {value: j.value, found: j.found, meta: j};
    },
  };
}

/* -------------------------------- 10) Tools API / Function Calls (2 paid + 2 OSS-ish) -------------------------------- */

/* Paid: OpenAI Functions (proxy pattern) */
function OpenAIFunctions(cfg: ProviderConfig): Provider {
  const auth = {Authorization: `Bearer ${cfg.apiKey}`};
  return {
    name: 'openai-functions',
    kind: 'tools',
    isOpenSource: false,
    async toolCall(i) {
      const j = await httpJSON(
        `${cfg.baseURL || 'https://api.openai.com'}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify({
            model: cfg.extra?.model || 'gpt-4o-mini',
            messages: [{role: 'user', content: JSON.stringify(i)}],
            tool_choice: 'auto',
            tools: cfg.extra?.tools || [],
          }),
        },
      );
      return {result: j, raw: j};
    },
  };
}

/* Paid: Zapier NLA (wide integrations) */
function ZapierTools(cfg: ProviderConfig): Provider {
  const auth = {'x-api-key': cfg.apiKey || ''};
  return {
    name: 'zapier-nla',
    kind: 'tools',
    isOpenSource: false,
    async toolCall(i) {
      const j = await httpJSON(
        `${
          cfg.baseURL || 'https://nla.zapier.com'
        }/api/v1/exposed/${i.name}/execute/`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...auth},
          body: JSON.stringify(i.args || {}),
        },
      );
      return {result: j, raw: j};
    },
  };
}

/* OSS: Generic HTTP Tool */
function HTTPTool(cfg: ProviderConfig): Provider {
  return {
    name: 'http-tool',
    kind: 'tools',
    isOpenSource: true,
    async toolCall(i) {
      const j = await httpJSON(i.endpoint!, {
        method: i.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(i.authHeader ? {Authorization: i.authHeader} : {}),
        },
        body: i.method === 'GET' ? undefined : JSON.stringify(i.args || {}),
      });
      return {result: j, raw: j};
    },
  };
}

/* OSS: Node-Local Function Router (in-process) */
function LocalFunctions(cfg: ProviderConfig): Provider {
  const table =
    cfg.extra?.fnTable || ({} as Record<string, (a: any) => Promise<any> | any>);
  return {
    name: 'local-fn',
    kind: 'tools',
    isOpenSource: true,
    async toolCall(i) {
      const fn = table[i.name];
      if (!fn) throw new Error(`No local function: ${i.name}`);
      const r = await fn(i.args);
      return {result: r};
    },
  };
}

/* -------------------------------- 11) Registry & High-level Facades -------------------------------- */

class MCPRegistry {
  private providers = new Map<string, Provider>();
  add(p: Provider) {
    this.providers.set(p.name, p);
    return this;
  }
  get(name: string) {
    return this.providers.get(name);
  }
  list(kind?: ProviderKind) {
    return [...this.providers.values()].filter((p) =>
      kind
        ? Array.isArray(p.kind)
          ? p.kind.includes(kind)
          : p.kind === kind
        : true,
    );
  }
  clear() {
    this.providers.clear();
  }
}
const registry = new MCPRegistry();

/* Voice facade */
const Voice = {
  async clone(preferred: string[], input: Contract.VoiceCloneIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.voiceClone)
        try {
          return await p.voiceClone(input);
        } catch (e) {
          console.warn(`[${n}] clone failed:`, (e as Error).message);
        }
    }
    throw new Error('No voice clone provider succeeded.');
  },
  async speak(preferred: string[], input: Contract.SpeakIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.speak)
        try {
          return await p.speak(input);
        } catch (e) {
          console.warn(`[${n}] tts failed:`, (e as Error).message);
        }
    }
    throw new Error('No TTS provider succeeded.');
  },
  async transcribe(preferred: string[], input: Contract.STTIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.transcribe)
        try {
          return await p.transcribe(input);
        } catch (e) {
          console.warn(`[${n}] stt failed:`, (e as Error).message);
        }
    }
    throw new Error('No STT provider succeeded.');
  },
};

/* Messaging facade */
const Messaging = {
  async send(preferred: string[], input: Contract.MsgIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.sendMessage)
        try {
          return await p.sendMessage(input);
        } catch (e) {
          console.warn(`[${n}] send failed:`, (e as Error).message);
        }
    }
    throw new Error('No messaging provider succeeded.');
  },
};

/* DB facade */
const DB = {
  async exec(preferred: string[], input: Contract.DBQueryIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.dbExec)
        try {
          return await p.dbExec(input);
        } catch (e) {
          console.warn(`[${n}] db failed:`, (e as Error).message);
        }
    }
    throw new Error('No DB provider succeeded.');
  },
};

/* Storage facade */
const Storage = {
  async put(preferred: string[], input: Contract.StoragePutIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.storagePut)
        try {
          return await p.storagePut(input);
        } catch (e) {
          console.warn(`[${n}] put failed:`, (e as Error).message);
        }
    }
    throw new Error('No Storage.put provider succeeded.');
  },
  async get(preferred: string[], input: Contract.StorageGetIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.storageGet)
        try {
          return await p.storageGet(input);
        } catch (e) {
          console.warn(`[${n}] get failed:`, (e as Error).message);
        }
    }
    throw new Error('No Storage.get provider succeeded.');
  },
};

/* RAG facade */
const RAG = {
  async embed(preferred: string[], input: Contract.EmbedIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.embed)
        try {
          return await p.embed(input);
        } catch (e) {
          console.warn(`[${n}] embed failed:`, (e as Error).message);
        }
    }
    throw new Error('No RAG.embed provider succeeded.');
  },
  async upsert(preferred: string[], input: Contract.UpsertIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.upsert)
        try {
          return await p.upsert(input);
        } catch (e) {
          console.warn(`[${n}] upsert failed:`, (e as Error).message);
        }
    }
    throw new Error('No RAG.upsert provider succeeded.');
  },
  async search(preferred: string[], input: Contract.SearchIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.search)
        try {
          return await p.search(input);
        } catch (e) {
          console.warn(`[${n}] search failed:`, (e as Error).message);
        }
    }
    throw new Error('No RAG.search provider succeeded.');
  },
};

/* Memory facade */
const Memory = {
  async note(preferred: string[], input: Contract.MemoryNoteIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.memoryNote)
        try {
          return await p.memoryNote(input);
        } catch (e) {
          console.warn(`[${n}] note failed:`, (e as Error).message);
        }
    }
    throw new Error('No Memory.note provider succeeded.');
  },
  async read(preferred: string[], input: Contract.MemoryReadIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.memoryRead)
        try {
          return await p.memoryRead(input);
        } catch (e) {
          console.warn(`[${n}] read failed:`, (e as Error).message);
        }
    }
    throw new Error('No Memory.read provider succeeded.');
  },
};

/* Tools facade */
const Tools = {
  async call(preferred: string[], input: Contract.ToolCallIn) {
    for (const n of preferred) {
      const p = registry.get(n);
      if (p?.toolCall)
        try {
          return await p.toolCall(input);
        } catch (e) {
          console.warn(`[${n}] tool failed:`, (e as Error).message);
        }
    }
    throw new Error('No Tools provider succeeded.');
  },
};

/* -------------------------------- 12) Dynamic Provider Initialization -------------------------------- */
export function initializeProviders(config: McpConfig) {
  registry.clear();

  // Voice + STT
  if (config.cartesia.apiKey)
    registry.add(Cartesia({apiKey: config.cartesia.apiKey}));
  if (config.elevenLabs.apiKey)
    registry.add(
      ElevenLabs({
        apiKey: config.elevenLabs.apiKey,
        extra: {model_id: config.elevenLabs.modelId},
      }),
    );
  if (config.coquiXtps.baseUrl)
    registry.add(CoquiXTTS({baseURL: config.coquiXtps.baseUrl}));
  if (config.piper.baseUrl)
    registry.add(
      Piper({baseURL: config.piper.baseUrl, extra: {voice: config.piper.voice}}),
    );
  if (config.deepgram.apiKey)
    registry.add(Deepgram({apiKey: config.deepgram.apiKey}));
  if (config.assemblyAi.apiKey)
    registry.add(AssemblyAI({apiKey: config.assemblyAi.apiKey}));
  if (config.vosk.baseUrl) registry.add(Vosk({baseURL: config.vosk.baseUrl}));
  if (config.fasterWhisper.baseUrl)
    registry.add(FasterWhisper({baseURL: config.fasterWhisper.baseUrl}));

  // Messaging
  if (config.whatsApp.apiKey && config.whatsApp.phoneId)
    registry.add(
      WhatsAppBusiness({
        apiKey: config.whatsApp.apiKey,
        extra: {phone_id: config.whatsApp.phoneId},
      }),
    );
  if (config.twilio.apiKey && config.twilio.sid && config.twilio.from)
    registry.add(
      Twilio({
        apiKey: config.twilio.apiKey,
        extra: {sid: config.twilio.sid, from: config.twilio.from},
      }),
    );
  if (config.matrix.apiKey && config.matrix.baseUrl)
    registry.add(
      Matrix({apiKey: config.matrix.apiKey, baseURL: config.matrix.baseUrl}),
    );
  if (config.mattermost.apiKey && config.mattermost.baseUrl)
    registry.add(
      Mattermost({
        apiKey: config.mattermost.apiKey,
        baseURL: config.mattermost.baseUrl,
      }),
    );

  // RAG
  if (config.pinecone.apiKey && config.pinecone.baseUrl)
    registry.add(
      Pinecone({
        apiKey: config.pinecone.apiKey,
        baseURL: config.pinecone.baseUrl,
      }),
    );
  if (config.weaviate.apiKey && config.weaviate.baseUrl)
    registry.add(
      WeaviateCloud({
        apiKey: config.weaviate.apiKey,
        baseURL: config.weaviate.baseUrl,
      }),
    );
  if (config.faiss.baseUrl) registry.add(FAISS({baseURL: config.faiss.baseUrl}));
  if (config.qdrant.baseUrl)
    registry.add(Qdrant({baseURL: config.qdrant.baseUrl}));

  // Memory
  if (config.notion.apiKey && config.notion.dbId)
    registry.add(
      NotionMemory({apiKey: config.notion.apiKey, extra: {db: config.notion.dbId}}),
    );
  if (config.jsonMemory.baseUrl)
    registry.add(JSONMemory({baseURL: config.jsonMemory.baseUrl}));

  // Tools
  if (config.openAi.apiKey)
    registry.add(
      OpenAIFunctions({
        apiKey: config.openAi.apiKey,
        extra: {model: config.openAi.model, tools: []},
      }),
    );
  if (config.zapier.apiKey)
    registry.add(ZapierTools({apiKey: config.zapier.apiKey}));
  
  // Add providers that don't need config
  registry.add(HTTPTool({}))
  registry.add(LocalFunctions({extra: {fnTable: {ping: async (a: any) => ({ok: true, echo: a})}}}));

  // Add mock providers for DB/Storage as they are not configurable via UI
  registry.add(PostgresNeon({db: {query: async (_sql: string, _p: any[]) => ({rows: [], rowCount: 0})}}))
  registry.add(SQLite({db: {prepare: (_s: string) => ({all: (..._a: any[]) => [], run: (..._a: any[]) => ({changes: 1})})}}))
  registry.add(PostgresLocal({db: {query: async (_sql: string, _p: any[]) => ({rows: [], rowCount: 0})}}));
  registry.add(S3({apiKey: '', baseURL: ''}))
  registry.add(FirebaseStorage({apiKey: '', baseURL: ''}))
  registry.add(MinIO({baseURL: ''}))
  registry.add(LocalFS({baseURL: ''}));
  registry.add(RedisMemory({db: {set: async () => {}, get: async () => null}}))
  registry.add(SQLiteMemory({db: {prepare: (_: string) => ({run: (..._a: any[]) => ({}), get: (..._a: any[]) => undefined})}}))
}

/* -------------------------------- 13) Exports -------------------------------- */
export {
  registry,
  Voice,
  Messaging,
  DB,
  Storage,
  RAG,
  Memory,
  Tools,
  /* Providers */
  Cartesia,
  ElevenLabs,
  CoquiXTTS,
  Piper,
  Deepgram,
  AssemblyAI,
  Vosk,
  FasterWhisper,
  WhatsAppBusiness,
  Twilio,
  Matrix,
  Mattermost,
  Firestore,
  PostgresNeon,
  SQLite,
  PostgresLocal,
  S3,
  FirebaseStorage,
  MinIO,
  LocalFS,
  Pinecone,
  WeaviateCloud,
  FAISS,
  Qdrant,
  NotionMemory,
  RedisMemory,
  SQLiteMemory,
  JSONMemory,
  OpenAIFunctions,
  ZapierTools,
  HTTPTool,
  LocalFunctions,
};
