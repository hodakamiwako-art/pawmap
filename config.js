/* ログイン（Supabase）の接続先。
   anon key は公開前提の鍵で、リポジトリに入れて問題ありません
   （行レベルセキュリティにより、各ユーザーは自分の行しか読み書きできません）。
   空にすれば地図だけの動作に戻り、お気に入りと自分のピンは端末内に保存されます。 */
window.PAWMAP_CONFIG = {
  supabaseUrl: 'https://lflvfvltbtwyhkhzrhcw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHZmdmx0YnR3eWhraHpyaGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMjMzNzAsImV4cCI6MjEwMjg5OTM3MH0.-TcHT83Pgo6Rw8HHSs4U1y69tZ3e-ZFai4frFyjFEuc',
};
