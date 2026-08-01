// Configuração do front. Contém apenas a URL do projeto e a ANON KEY —
// ambas públicas por natureza e protegidas pela RLS. A service_role key
// JAMAIS entra neste arquivo nem em qualquer arquivo do front (regra 10).

export const SUPABASE_URL = 'https://iqldovwttomkjkoakosc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxbGRvdnd0dG9ta2prb2Frb3NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDU4NzksImV4cCI6MjA5NjA4MTg3OX0.4dYeK5iIEgSD7CEWyLoaqXEXvuITVNVpTlfdmCyJCI0';

export const CONFIG = {
  dominioPermitido: '@educacao.pmrp.sp.gov.br',
  timezone: 'America/Sao_Paulo',
  bucketAnexos: 'anexos',
  tamanhoMaximoAnexoMB: 20,
  tiposAnexoPermitidos: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ]
};
