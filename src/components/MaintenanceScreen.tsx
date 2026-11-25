import { Wrench } from "lucide-react";

export function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-primary/10 p-6 rounded-full mb-6 animate-pulse">
        <Wrench className="h-16 w-16 text-primary" />
      </div>
      <h1 className="text-3xl font-bold text-foreground mb-4">Under Maintenance</h1>
      <p className="text-muted-foreground max-w-md mx-auto text-lg leading-relaxed">
        {message}
      </p>
    </div>
  );
}
