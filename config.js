/* ログイン（Supabase）の接続先。
   supabase.com でプロジェクトを作り、Settings → API から
   Project URL と anon public key をここに貼ってください。
   anon key は公開前提の鍵で、リポジトリに入れて問題ありません
   （行レベルセキュリティで各ユーザーは自分の行しか触れません）。
   空のままでも地図は動きます。その場合、お気に入りと自分のピンは端末内に保存されます。 */
window.PAWMAP_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
