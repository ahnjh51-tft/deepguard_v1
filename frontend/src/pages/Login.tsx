import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import deepguardLogo from "@/assets/deepguard-logo.png";
import { Loader2, ShieldCheck } from "lucide-react";

const SAMPLE_HINTS = [
  { label: "管理者 (Admin)", email: "admin@deepguard.jp", password: "Admin#123" },
  { label: "利用者 (User)", email: "user@deepguard.jp", password: "User#123" },
];

const Login = () => {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await login(email, password);
      toast({ title: "ログイン成功", description: "ようこそ DEEPGUARD へ" });
    } catch (error) {
      toast({
        title: "ログイン失敗",
        description: error instanceof Error ? error.message : "認証に失敗しました。",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/5 blur-[100px] animate-pulse delay-1000" />
      </div>

      <Card className="vertex-card w-full max-w-md relative z-10">
        <CardHeader className="space-y-4 text-center pb-8 border-b border-border bg-secondary/30">
          <div className="mx-auto w-20 h-20 relative group">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <img src={deepguardLogo} alt="DeepGuard" className="w-full h-full object-contain relative z-10" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">DEEPGUARD</CardTitle>
            <CardDescription className="text-primary font-medium tracking-widest uppercase text-xs">
              AI Truth Scan
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-normal text-foreground">メールアドレス</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="email@example.com"
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-normal text-foreground">パスワード</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="bg-background"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 font-semibold shadow-glow transition-all duration-300"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  認証中...
                </>
              ) : (
                "ログイン"
              )}
            </Button>
          </form>

          <div className="pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider text-center">
              サンプルアカウント
            </p>
            <div className="grid grid-cols-1 gap-3">
              {SAMPLE_HINTS.map((hint) => (
                <div
                  key={hint.email}
                  className="p-3 rounded-lg border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer group"
                  onClick={() => {
                    setEmail(hint.email);
                    setPassword(hint.password);
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-primary flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      {hint.label}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-foreground">{hint.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">PW: {hint.password}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
