import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { ProjectBriefView } from "@/components/projects/ProjectBriefView";

/**
 * Standalone /projects/:id route. The actual UI lives in ProjectBriefView so
 * the in-shell Projects surface can render the same thing inline.
 */
export default function ProjectBriefPage() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!id) return <Navigate to="/projects" replace />;

  return (
    <ProjectBriefView
      id={id}
      onBack={() => navigate("/projects")}
      onDeleted={() => navigate("/projects")}
    />
  );
}
