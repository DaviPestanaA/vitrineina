
import { useState, useEffect, useRef } from 'react';
import { AppState, Client, ContentCard } from '../types';
import { supabase } from '../services/supabaseClient';

const STORAGE_KEY = 'planner_vitrine_v1';

interface StoreState extends AppState {
  currentClientId: string | null;
  isLoading: boolean;
}

interface Actions {
  setCurrentClientId: (id: string | null) => void;
  loadInitialData: () => Promise<void>;
  addClient: (client: Omit<Client, 'id' | 'createdAt'>) => Promise<Client | null>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addCard: (card: Partial<ContentCard>) => Promise<ContentCard | null>;
  updateCard: (id: string, updates: Partial<ContentCard>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  duplicateCard: (id: string) => Promise<void>;
}

export type FullStore = StoreState & Actions;

// Tenta carregar do LocalStorage como estado inicial para evitar tela branca se o Supabase falhar
const getSavedState = (): AppState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Erro ao ler cache local", e);
  }
  return { clients: [], cards: [], dailyNotes: [] };
};

const initialState = getSavedState();

let globalState: StoreState = {
  ...initialState,
  currentClientId: null,
  isLoading: false
};

const listeners = new Set<() => void>();

const updateState = (updater: Partial<StoreState> | ((prev: StoreState) => Partial<StoreState>)) => {
  const patch = typeof updater === 'function' ? updater(globalState) : updater;
  globalState = { ...globalState, ...patch };
  
  // Persistência local imediata (melhora UX offline/fallback)
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    clients: globalState.clients,
    cards: globalState.cards,
    dailyNotes: globalState.dailyNotes
  }));
  
  listeners.forEach(l => l());
};

const actions: Actions = {
  setCurrentClientId: (id) => {
    const cleanId = typeof id === 'string' ? id : null;
    updateState({ currentClientId: cleanId });
  },

  loadInitialData: async () => {
    if (!supabase) {
      console.warn("Supabase não configurado. Operando apenas em modo local.");
      return;
    }

    updateState({ isLoading: true });
    try {
      const { data: clients, error: clientError } = await supabase.from('clients').select('*').order('nome');
      const { data: cards, error: cardError } = await supabase.from('cards').select('*');
      
      if (clientError || cardError) throw new Error("Falha na sincronização");

      updateState({ 
        clients: clients || [], 
        cards: cards || [],
        isLoading: false 
      });
    } catch (e) {
      console.error("Erro ao carregar dados do Supabase, mantendo dados locais.", e);
      updateState({ isLoading: false });
    }
  },

  addClient: async (clientData) => {
    const newClient: Client = { 
      ...clientData, 
      id: `client-${Date.now()}`, 
      createdAt: new Date().toISOString() 
    };

    // Update local primeiro para UI responsiva
    updateState(prev => ({ clients: [...prev.clients, newClient] }));

    if (supabase) {
      const { error } = await supabase.from('clients').insert(newClient);
      if (error) console.error("Erro ao persistir no Supabase", error);
    }
    
    return newClient;
  },

  updateClient: async (id, updates) => {
    updateState(prev => ({ 
      clients: prev.clients.map(c => c.id === id ? { ...c, ...updates } : c) 
    }));

    if (supabase) {
      const { error } = await supabase.from('clients').update(updates).eq('id', id);
      if (error) console.error("Erro ao atualizar no Supabase", error);
    }
  },

  deleteClient: async (id) => {
    updateState(prev => ({
      clients: prev.clients.filter(c => c.id !== id),
      cards: prev.cards.filter(c => c.clientId !== id),
      currentClientId: prev.currentClientId === id ? null : prev.currentClientId
    }));

    if (supabase) {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) console.error("Erro ao deletar no Supabase", error);
    }
  },

  addCard: async (cardData) => {
    const newCard: ContentCard = {
      id: `card-${Date.now()}`,
      clientId: cardData.clientId || '',
      dateISO: cardData.dateISO || '',
      titulo: cardData.titulo || 'Novo Post',
      tipo: cardData.tipo || 'Post',
      pilar: cardData.pilar || 'Geral',
      status: cardData.status || 'A Fazer',
      copy: '', legenda: '', notas: '',
      links: [], checklist: [], tags: [],
      isBacklog: !!cardData.isBacklog,
      isFavorite: false,
      ...cardData
    };

    updateState(prev => ({ cards: [...prev.cards, newCard] }));

    if (supabase) {
      const { error } = await supabase.from('cards').insert(newCard);
      if (error) console.error("Erro ao persistir post no Supabase", error);
    }
    
    return newCard;
  },

  updateCard: async (id, updates) => {
    updateState(prev => ({ 
      cards: prev.cards.map(c => c.id === id ? { ...c, ...updates } : c) 
    }));

    if (supabase) {
      const { error } = await supabase.from('cards').update(updates).eq('id', id);
      if (error) console.error("Erro ao atualizar post no Supabase", error);
    }
  },

  deleteCard: async (id) => {
    updateState(prev => ({ 
      cards: prev.cards.filter(c => c.id !== id) 
    }));

    if (supabase) {
      const { error } = await supabase.from('cards').delete().eq('id', id);
      if (error) console.error("Erro ao deletar post no Supabase", error);
    }
  },

  duplicateCard: async (id) => {
    const card = globalState.cards.find(c => c.id === id);
    if (!card) return;
    
    const newCard = { 
      ...card, 
      id: `card-${Date.now()}`, 
      titulo: `${card.titulo} (Cópia)` 
    };

    updateState(prev => ({ cards: [...prev.cards, newCard] }));

    if (supabase) {
      const { error } = await supabase.from('cards').insert(newCard);
      if (error) console.error("Erro ao duplicar no Supabase", error);
    }
  }
};

export const useStore = <T>(selector: (state: FullStore) => T): T => {
  const [, forceUpdate] = useState({});
  const selectorRef = useRef(selector);
  const lastValueRef = useRef<T>(selector({ ...globalState, ...actions }));

  useEffect(() => {
    selectorRef.current = selector;
  });

  useEffect(() => {
    const listener = () => {
      const nextValue = selectorRef.current({ ...globalState, ...actions });
      if (nextValue !== lastValueRef.current) {
        lastValueRef.current = nextValue;
        forceUpdate({});
      }
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return lastValueRef.current;
};
