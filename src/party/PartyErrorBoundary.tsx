import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  onBack?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class PartyErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred in JTEC Party.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.warn('[PartyErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 max-w-lg mx-auto text-center space-y-4 shadow-2xl my-8 animate-in fade-in">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-white">Party Mode Error</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {this.state.errorMessage || 'Something went wrong while connecting to the party room.'}
            </p>
          </div>

          <div className="flex gap-2.5 pt-2">
            {this.props.onBack && (
              <button
                type="button"
                onClick={this.props.onBack}
                className="flex-1 py-2.5 rounded-xl border border-white/10 bg-slate-950 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Settings</span>
              </button>
            )}

            <button
              type="button"
              onClick={this.handleRetry}
              className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
