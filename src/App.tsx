import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { CurrentContextProvider } from "@/providers/CurrentContextProvider";
import { VantaContextProvider } from "@/providers/VantaContextProvider";
import { AwarenessProvider } from "@/providers/AwarenessProvider";
import { WorkspaceProvider } from "@/providers/WorkspaceProvider";
import { AskThreadProvider } from "@/providers/AskThreadProvider";
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
import { ActivityProvider } from "@/components/workstatus/ActivityStore";
import { ActivityTray } from "@/components/workstatus/ActivityTray";
import { AmbientBackdrop } from "@/components/shell/AmbientBackdrop";
import { AmbientInteractions } from "@/components/shell/AmbientInteractions";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Settings from "./pages/Settings.tsx";
import SettingsGroup from "./pages/SettingsGroup.tsx";
import IntegrationsSettings from "./pages/IntegrationsSettings.tsx";
import ReconciliationView from "./pages/ReconciliationView.tsx";
import ConnectedAccounts from "./pages/ConnectedAccounts.tsx";
import WorkspaceStructure from "./pages/WorkspaceStructure.tsx";
import ProjectsPage from "./pages/Projects.tsx";
import ProjectBriefPage from "./pages/ProjectBrief.tsx";
import DocumentsPage from "./pages/Documents.tsx";
import RoomMapPage from "./pages/RoomMap.tsx";
import WearablesPage from "./pages/Wearables.tsx";
import WearableLoopPage from "./pages/WearableLoop.tsx";
import WatchPage from "./pages/Watch.tsx";
import MotionPage from "./pages/Motion.tsx";
import GlancePage from "./pages/Glance.tsx";
import PhysicalLoopPage from "./pages/PhysicalLoop.tsx";
import TelegramSetupPage from "./pages/TelegramSetup.tsx";
import NotFound from "./pages/NotFound.tsx";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AmbientBackdrop />
      <AmbientInteractions />
      <BrowserRouter>
        <AuthProvider>
          <SherlockProvider>
            <EntityProvider>
              <CanvasProvider>
                <CurrentContextProvider>
                 <VantaContextProvider>
                  <AwarenessProvider>
                    <WorkspaceProvider>
                     <AskThreadProvider>
                      <CompanionProvider>
                        <ActivityProvider>
                          <TutorialProvider>
                            <Routes>
                              <Route path="/" element={<Index />} />
                              <Route path="/projects" element={<ProjectsPage />} />
                              <Route path="/projects/:id" element={<ProjectBriefPage />} />
                              <Route path="/documents" element={<DocumentsPage />} />
                              <Route path="/how" element={<RoomMapPage />} />
                              <Route path="/wearables" element={<WearablesPage />} />
                              <Route path="/physical-loop" element={<PhysicalLoopPage />} />
                              <Route path="/wearable-loop" element={<WearableLoopPage />} />
                              <Route path="/watch" element={<WatchPage />} />
                              <Route path="/motion" element={<MotionPage />} />
                              <Route path="/glance" element={<GlancePage />} />

                              <Route path="/auth" element={<Auth />} />
                              <Route path="/settings" element={<Settings />} />
                              <Route path="/settings/g/:groupId" element={<SettingsGroup />} />
                              <Route path="/settings/telegram" element={<TelegramSetupPage />} />
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
                            <ActivityTray />
                          </TutorialProvider>
                        </ActivityProvider>
                      </CompanionProvider>
                     </AskThreadProvider>
                    </WorkspaceProvider>
                  </AwarenessProvider>
                 </VantaContextProvider>
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
