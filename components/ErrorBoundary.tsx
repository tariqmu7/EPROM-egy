import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  pageName?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.pageName ?? 'Page'} crashed:`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] p-12 text-center">
          <div className="bg-rose-50 text-rose-500 p-6 rounded-none mb-6">
            <AlertTriangle size={48} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Something went wrong</h2>
          <p className="text-slate-600 max-w-md mb-2">
            {this.props.pageName ? `The ${this.props.pageName} page` : 'This page'} encountered an unexpected error.
          </p>
          <p className="text-xs text-slate-400 font-mono mb-8 max-w-lg break-all">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-2 bg-blue-700 text-white px-6 py-2.5 font-medium hover:bg-blue-800 transition-colors"
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
