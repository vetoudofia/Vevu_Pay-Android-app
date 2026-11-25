// Augment TanStack Router's history state with the fields our transfer flows pass.
import "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface HistoryState {
    transfer?: unknown;
    prefill?: string;
    prefillAmount?: string;
    prefillDescription?: string;
  }
}
