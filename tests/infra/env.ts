export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `環境変数 ${name} が未設定です。.env.example を参考に .env に設定してください。`,
    );
  }
  return value;
}
