import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/Button";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("PlayNext uncaught React error:", error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-ink-deep p-6 text-paper">
          <div className="w-full max-w-lg border-2 border-paper bg-ink p-8 shadow-press">
            <span className="pn-stamp mb-3 inline-flex">INCIDENT TECHNIQUE</span>
            <h2 className="pn-display text-3xl text-paper">
              Une erreur est survenue
            </h2>
            <p className="mt-3 text-sm text-paper-2 font-ui leading-relaxed">
              L'affichage a rencontré un problème imprévu. Vos données et vos sessions sont préservées.
            </p>
            {this.state.error?.message ? (
              <pre className="mt-4 overflow-x-auto border border-rule bg-ink-deep p-3 font-data text-xs text-smoke">
                {this.state.error.message}
              </pre>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="primary" onClick={this.handleReset}>
                Réinitialiser la vue
              </Button>
              <Button
                variant="second"
                onClick={() => window.location.reload()}
              >
                Recharger l’application
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
