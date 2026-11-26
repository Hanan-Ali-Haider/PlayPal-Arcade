import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Something went wrong.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-dot-yellow p-6 text-center">
          <div className="max-w-md rounded-2xl border-2 border-black bg-white p-6 neo-shadow-lg">
            <h1 className="font-display text-2xl font-extrabold tracking-tighter text-black">
              Connection Interrupted
            </h1>
            <p className="mt-2 text-sm text-black/75">
              Something unexpected happened. Reload the page to reconnect to your room.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="neo-btn mt-5 bg-black px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
            >
              Reload Arcade
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
