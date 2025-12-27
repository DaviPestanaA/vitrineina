
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Só inicializa se as chaves estiverem presentes para evitar o erro "supabaseUrl is required"
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
