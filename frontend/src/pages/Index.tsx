import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ShieldCheck, LogOut, Scan, History } from "lucide-react";
import DetectionTab from "@/components/detection/DetectionTab";
import HistoryTab from "@/components/detection/HistoryTab";
import { useAuth } from "@/context/AuthContext";
import deepguardLogo from "@/assets/deepguard-logo.png";

const Index = () => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  const tabs = useMemo(
    () => [
      {
        value: "detection",
        label: "検出",
        icon: Scan,
        roles: ["admin", "user"],
        content: <DetectionTab />,
      },
      {
        value: "history",
        label: "履歴",
        icon: History,
        roles: ["admin"],
        content: <HistoryTab />,
      },
    ],
    []
  );

  const visibleTabs = tabs.filter((tab) => tab.roles.includes(user?.role ?? "user"));
  const defaultTab = visibleTabs[0]?.value ?? "detection";

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* Vertex AI Style Header */}
      <header className="vertex-header sticky top-0 z-50 h-16 flex items-center px-6 shadow-sm">
        <div className="flex items-center gap-3 mr-8">
          <img src={deepguardLogo} alt="DeepGuard" className="w-8 h-8 object-contain" />
          <span className="text-xl font-medium tracking-tight text-foreground">
            DeepGuard <span className="text-primary font-bold">Console</span>
          </span>
        </div>

        <div className="flex-1 flex items-center justify-between">
          {/* Navigation could go here if needed, keeping it clean for now */}
          <div className="hidden md:flex items-center text-sm text-muted-foreground">
            <span className="px-3 py-1 bg-secondary rounded-full text-xs font-medium">
              プロジェクト: Default
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                <ShieldCheck className="w-3 h-3" />
                {isAdmin ? "管理者" : "利用者"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={logout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              ログアウト
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-7xl">
        <Tabs defaultValue={defaultTab} className="w-full space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-1">
            <TabsList className="bg-transparent p-0 h-auto space-x-6">
              {visibleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-none border-b-2 border-transparent px-2 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {visibleTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="focus-visible:outline-none">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
