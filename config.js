/* ログイン（Supabase）の接続先。
   anon key は公開前提の鍵で、リポジトリに入れて問題ありません
   （行レベルセキュリティにより、各ユーザーは自分の行しか読み書きできません）。
   空にすれば地図だけの動作に戻り、お気に入りと自分のピンは端末内に保存されます。 */
window.PAWMAP_CONFIG = {
  /* 地図タイル（CARTO）の鍵。https://carto.com/basemaps/apikey/ で無料で取れます
     （アカウント不要、月500万タイルまで）。空のままだと OpenStreetMap の
     タイルを使います。動きますが、明るい配色のみでダークテーマには追従しません。 */
  cartoApiKey: 'cb1_2uvn_1_6a4be5af6f2418df4586d4ce',

  supabaseUrl: 'https://lflvfvltbtwyhkhzrhcw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHZmdmx0YnR3eWhraHpyaGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMjMzNzAsImV4cCI6MjEwMjg5OTM3MH0.-TcHT83Pgo6Rw8HHSs4U1y69tZ3e-ZFai4frFyjFEuc',
};
