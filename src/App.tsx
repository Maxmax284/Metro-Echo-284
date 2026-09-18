import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { PlaceSkin } from "@/components/shell/PlaceSkin";
import { AmbientInteractions } from "@/components/shell/AmbientInteractions";
import { useRegisterServiceWorker } from "@/hooks/useRegisterServiceWorker";
import { useDeliveryAck } from "@/hooks/useDeliveryAck";
import Index from "./pages/Index.tsx";
import GoogleCalendarReturn from "./pages/oauth/GoogleCalendarReturn";
import GoogleReturn from "./pages/oauth/GoogleReturn";
import Auth from "./pages/Auth.tsx";
import Settings from "./pages/Settings.tsx";
import InstallApp from "./pages/InstallApp.tsx";
import SettingsGroup from "./pages/SettingsGroup.tsx";
import IntegrationsSettings from "./pages/IntegrationsSettings.tsx";
import ReconciliationView from "./pages/ReconciliationView.tsx";
import ConnectedAccounts from "./pages/ConnectedAccounts.tsx";
import WorkspaceStructure from "./pages/WorkspaceStructure.tsx";
import ProjectsPage from "./pages/Projects.tsx";
import FlightsPage from "./pages/Flights.tsx";
import ProjectBriefPage from "./pages/ProjectBrief.tsx";
import DocumentsPage from "./pages/Documents.tsx";
import RoomMapPage from "./pages/RoomMap.tsx";
import WearableLoopPage from "./pages/WearableLoop.tsx";
import WatchPage from "./pages/Watch.tsx";

import GlancePage from "./pages/Glance.tsx";
import PhysicalLoopPage from "./pages/PhysicalLoop.tsx";
import TelegramSetupPage from "./pages/TelegramSetup.tsx";
import TelegramGuidePage from "./pages/TelegramGuidePage.tsx";
import LocationSetupPage from "./pages/LocationSetup.tsx";
import WhatIsMetroEcho from "./pages/WhatIsMetroEcho.tsx";
import NotFound from "./pages/NotFound.tsx";


const queryClient = new QueryClient();

/* A tapped notification action carries a status, never an execution. It is
   applied here, inside the signed-in session, and then wiped from the URL. */
const DeliveryAck = () => {
  useDeliveryAck();
  return null;
};

const App = () => {
  useRegisterServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AmbientBackdrop />
        <AmbientInteractions />
        <BrowserRouter>
          <AuthProvider>
            <DeliveryAck />
            <SherlockProvider>
              <EntityProvider>
                <CanvasProvider>
                  <CurrentContextProvider>
                   <VantaContextProvider>
                    <AwarenessProvider>
                      <PlaceSkin />
                      <WorkspaceProvider>
                       <AskThreadProvider>
                        <CompanionProvider>
                          <ActivityProvider>
                            <TutorialProvider>
                              <Routes>
                                <Route path="/" element={<Index />} />
                                {/* A flight number is put in standing in a line.
                                    It gets its own address so it is one tap. */}
                                <Route path="/flights" element={<FlightsPage />} />
                                <Route path="/flight" element={<Navigate to="/flights" replace />} />
                                <Route path="/projects" element={<ProjectsPage />} />
                                <Route path="/projects/:id" element={<ProjectBriefPage />} />
                                <Route path="/documents" element={<DocumentsPage />} />
                                {/* One door: /how. Everything explanatory lives behind it. */}
                                <Route path="/how" element={<RoomMapPage />} />
                                <Route path="/how/paper" element={<PhysicalLoopPage />} />
                                <Route path="/how/watch" element={<WearableLoopPage />} />
                                <Route path="/how/glance" element={<GlancePage />} />
                                <Route path="/how/trends" element={<WatchPage />} />
                                {/* Old standalone doors — kept as redirects so links never break. */}
                                <Route path="/wearables" element={<Navigate to="/how/watch" replace />} />
                                <Route path="/wearable-loop" element={<Navigate to="/how/watch" replace />} />
                                <Route path="/physical-loop" element={<Navigate to="/how/paper" replace />} />
                                <Route path="/watch" element={<Navigate to="/how/trends" replace />} />
                                <Route path="/motion" element={<Navigate to="/how/trends" replace />} />
                                <Route path="/glance" element={<Navigate to="/how/glance" replace />} />
                                <Route path="/awareness/location" element={<LocationSetupPage />} />

                                <Route path="/auth" element={<Auth />} />
                                <Route path="/what-is-metro-echo" element={<WhatIsMetroEcho />} />
                                <Route path="/oauth/google-calendar/return" element={<GoogleCalendarReturn />} />
                                <Route path="/oauth/google/return" element={<GoogleReturn />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/install" element={<InstallApp />} />
                                <Route path="/settings/g/:groupId" element={<SettingsGroup />} />
                                <Route path="/settings/telegram" element={<TelegramSetupPage />} />
                                <Route path="/guide/telegram" element={<TelegramGuidePage />} />
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
};

export default App;
