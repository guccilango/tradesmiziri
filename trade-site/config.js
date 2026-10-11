// ============================================================
//  CONFIGURAÇÃO
//  Deixe vazio  -> "Modo local": contas e dados ficam só no seu navegador.
//  Preencha     -> "Modo online" (Supabase): contas reais, lista de itens
//                  GLOBAL compartilhada, trades separadas por conta.
//  Veja o README.md para o passo a passo (5 minutos, grátis).
// ============================================================
window.TRADE_CONFIG = {
  SUPABASE_URL: "https://gesegrsclcijdpnzytmq.supabase.co/rest/v1/",       // ex: "https://abcd1234.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlc2VncnNjbGNpamRwbnp5dG1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NDgyNzIsImV4cCI6MjEwNzMyNDI3Mn0.WusZUKjaOJFIwEHZySrvyfIsFjIIj16SwP_gGe5dgAs"   // chave "anon public" do projeto
};
