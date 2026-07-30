// Copie este arquivo para js/config.js e preencha com os dados do projeto.
// js/config.js está no .gitignore e NUNCA deve ser versionado.
// Use apenas a anon key. A service_role key jamais entra no front-end.

export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_ANON_KEY = 'COLE_AQUI_A_ANON_KEY';

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
