import { createClient } from "@supabase/supabase-js";

// Publishable/anon key ini memang aman untuk ditaruh di kode frontend,
// karena akses data diatur lewat Row Level Security (RLS) di Supabase.
const supabaseUrl = "https://pxqfjvrizlmnhwfygxad.supabase.co";
const supabaseKey = "sb_publishable_14qz_RbB1aSzPR47NQhbew_qOvbPirq";

export const supabase = createClient(supabaseUrl, supabaseKey);
