import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Bir bileşen çökerse boş sayfa yerine hata mesajı ve yeniden deneme gösterir */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty">
        <h2>Bir şeyler ters gitti</h2>
        <p className="error">{this.state.error.message}</p>
        <button className="btn primary" onClick={() => this.setState({ error: null })}>
          Tekrar dene
        </button>
      </div>
    );
  }
}
