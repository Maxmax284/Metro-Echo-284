import { lazy, Suspense } from "react";
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
import { SkyChannel } from "@/components/shell/SkyChannel";
import { RegionTintChannel } from "@/components/shell/RegionTintChannel";
import { AmbientInteractions } from "@/components/shell/AmbientInteractions";
import { DeskTransitOverlay } from "@/components/shell/DeskTransit";
import { useRegisterServiceWorker } from "@/hooks/useRegisterServiceWorker";
import { useDeliveryAck } from "@/hooks/useDeliveryAck";
import Index from "./pages/Index.tsx";
const GoogleCalendarReturn = lazy(() => import("./pages/oauth/GoogleCalendarReturn"));
const GoogleReturn = lazy(() => import("./pages/oauth/GoogleReturn"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const InstallApp = lazy(() => import("./pages/InstallApp.tsx"));
const SettingsGroup = lazy(() => import("./pages/SettingsGroup.tsx"));
const IntegrationsSettings = lazy(() => import("./pages/IntegrationsSettings.tsx"));
const ReconciliationView = lazy(() => import("./pages/ReconciliationView.tsx"));
const ConnectedAccounts = lazy(() => import("./pages/ConnectedAccounts.tsx"));
const WorkspaceStructure = lazy(() => import("./pages/WorkspaceStructure.tsx"));
const ProjectsPage = lazy(() => import("./pages/Projects.tsx"));
const FlightsPage = lazy(() => import("./pages/Flights.tsx"));
const WeatherStationPage = lazy(() => import("./pages/WeatherStation.tsx"));
const ProjectBriefPage = lazy(() => import("./pages/ProjectBrief.tsx"));
const DocumentsPage = lazy(() => import("./pages/Documents.tsx"));
const RoomMapPage = lazy(() => import("./pages/RoomMap.tsx"));
const WearableLoopPage = lazy(() => import("./pages/WearableLoop.tsx"));
const WatchPage = lazy(() => import("./pages/Watch.tsx"));

const GlancePage = lazy(() => import("./pages/Glance.tsx"));
const PhysicalLoopPage = lazy(() => import("./pages/PhysicalLoop.tsx"));
const TelegramSetupPage = lazy(() => import("./pages/TelegramSetup.tsx"));
const TelegramGuidePage = lazy(() => import("./pages/TelegramGuidePage.tsx"));
const LocationSetupPage = lazy(() => import("./pages/LocationSetup.tsx"));
const WhatIsMetroEcho = lazy(() => import("./pages/WhatIsMetroEcho.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));


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
        <DeskTransitOverlay />
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
                      <SkyChannel />
                      <RegionTintChannel />
                      <WorkspaceProvider>
                       <AskThreadProvider>
                        <CompanionProvider>
                          <ActivityProvider>
                            <TutorialProvider>
                              <Suspense fallback={null}>
<Routes>
                                <Route path="/" element={<Index />} />
                                {/* A flight number is put in standing in a line.
                                    It gets its own address so it is one tap. */}
                                <Route path="/flights" element={<FlightsPage />} />
                                <Route path="/weather" element={<WeatherStationPage />} />
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
</Suspense>
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
