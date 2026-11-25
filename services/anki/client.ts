import type { AnkiSettings } from '@/types/anki';

export type AnkiConnection = Pick<AnkiSettings, 'port' | 'apiKey'>;

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  options: { allowDuplicate: boolean; duplicateScope?: 'deck'; duplicateScopeOptions?: { deckName: string; checkChildren: boolean } };
  tags: string[];
}

export interface AnkiNoteInfo {
  noteId: number;
  modelName: string;
  tags?: string[];
  cards?: number[];
  fields: Record<string, { value: string }>;
}

export interface AnkiCardTemplate {
  Name: string;
  Front: string;
  Back: string;
}

export interface AnkiCreateModelParams {
  modelName: string;
  inOrderFields: string[];
  css?: string;
  isCloze?: boolean;
  cardTemplates: AnkiCardTemplate[];
}

interface Actions {
  requestPermission: [undefined, { permission: string; requireApiKey?: boolean }];
  version: [undefined, number];
  createDeck: [{ deck: string }, number];
  addTags: [{ notes: number[]; tags: string }, null];
  cardsInfo: [{ cards: number[] }, { cardId: number; deckName: string }[]];
  deckNames: [undefined, string[]];
  modelNames: [undefined, string[]];
  modelFieldNames: [{ modelName: string }, string[]];
  modelTemplates: [{ modelName: string }, Record<string, { Front: string; Back: string }>];
  updateModelTemplates: [{ model: { name: string; templates: Record<string, { Front: string; Back: string }> } }, null];
  createModel: [AnkiCreateModelParams, unknown];
  deckNamesAndIds: [undefined, Record<string, number>];
  getDeckStats: [{ decks: string[] }, Record<string, { review_count: number }>];
  cardReviews: [{ deck: string; startID: number }, Array<[number, number, number, number, number, number, number, number, number]>];
  findCards: [{ query: string }, number[]];
  findNotes: [{ query: string }, number[]];
  notesInfo: [{ notes: number[] }, AnkiNoteInfo[]];
  canAddNotes: [{ notes: AnkiNote[] }, boolean[]];
  addNote: [{ note: AnkiNote }, number];
  addNotes: [{ notes: AnkiNote[] }, Array<number | null>];
  storeMediaFile: [{ filename: string; data: string }, string];
  updateNoteFields: [{ note: { id: number; fields: Record<string, string> } }, null];
}

export class AnkiClient {
  constructor(private readonly connection: AnkiConnection) {}

  async request<Action extends keyof Actions>(action: Action, params: Actions[Action][0]): Promise<Actions[Action][1]> {
    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${this.connection.port}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, version: 6, params, key: this.connection.apiKey || undefined }),
        signal: AbortSignal.timeout(action === 'requestPermission' ? 25000 : 8000),
        redirect: 'error',
      });
    } catch {
      throw new Error(`Could not reach AnkiConnect on port ${this.connection.port}. Open Anki Desktop and check that AnkiConnect is enabled.`);
    }

    if (response.status === 403) {
      throw new Error('AnkiConnect denied access. Check the allowed extension origin and API key in AnkiConnect.');
    }
    if (!response.ok) throw new Error(`AnkiConnect returned HTTP ${response.status}.`);

    const payload: unknown = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || !('result' in payload) || !('error' in payload)) {
      throw new Error('AnkiConnect returned an invalid response.');
    }
    if (payload.error !== null) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'AnkiConnect could not complete the request.');
    }
    return payload.result as Actions[Action][1];
  }
}
