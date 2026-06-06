import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { CurrentContextProvider } from "@/providers/CurrentContextProvider";
import { AwarenessProvider } from "@/providers/AwarenessProvider";
import { WorkspaceProvider } from "@/providers/WorkspaceProvider";
import { CompanionProvider } from "@/components/companion/CompanionContext";
import { CompanionWidget } from "@/components/companion/CompanionWidget";
import { SherlockProvider } from "@/components/sherlock/SherlockContext";
import { SherlockOverlay } from "@/components/sherlock/SherlockOverlay";
import { EntityProvider } from "@/components/entities/EntityContext";
import { EntityDetailSheet } from "@/components/entities/EntityDetailSheet";
import { CanvasProvider } from "@/components/entities/CanvasContext";
import { CommandCanvas } from "@/components/entities/CommandCanvas";
import { TutorialProvider } from "@/components/tutorial/TutorialProvider";
import { FirstRunWalkthrough } from "@/components/tutorial/FirstRunWalkthrough";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Settings from "./pages/Settings.tsx";
import IntegrationsSettings from "./pages/IntegrationsSettings.tsx";
import ReconciliationView from "./pages/ReconciliationView.tsx";
import ConnectedAccounts from "./pages/ConnectedAccounts.tsx";
import WorkspaceStructure from "./pages/WorkspaceStructure.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SherlockProvider>
            <EntityProvider>
              <CanvasProvider>
                <CurrentContextProvider>
                  <AwarenessProvider>
                    <WorkspaceProvider>
                      <CompanionProvider>
                        <TutorialProvider>
                          <Routes>
                            <Route path="/" element={<Index />} />
                            <Route path="/auth" element={<Auth />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/settings/integrations" element={<IntegrationsSettings />} />
                            <Route path="/settings/integrations/reconciliation" element={<ReconciliationView />} />
                            <Route path="/settings/connected-accounts" element={<ConnectedAccounts />} />
                            <Route path="/settings/workspaces" element={<WorkspaceStructure />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                          <CompanionWidget />
                          <SherlockOverlay />
                          <EntityDetailSheet />
                          <CommandCanvas />
                          <FirstRunWalkthrough />
                        </TutorialProvider>
                      </CompanionProvider>
                    </WorkspaceProvider>
                  </AwarenessProvider>
                </CurrentContextProvider>
              </CanvasProvider>
            </EntityProvider>
          </SherlockProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
