# TradView - Design Decisions & Architecture

> **Note: This was an incredibly fun and engaging project to build! The combination of real-time data, modern tooling, and architectural challenges made for an exciting development experience.**

## Server Architecture
- **Store-based Emitter**: Implemented a centralized store pattern with event emission to maintain real-time page state across multiple clients efficiently
- **Playwright Optimization**: Chose Playwright waitFor function with loop over on "webSocket" listern considering time constraints - WebSockets were ideal but time constraints prevented proper price parsing implementation
- **JWT Authentication**: Essential for user distinction since we're not using WebSocket connections; enables proper session management and data isolation
- **Emmet Integration**: Leveraged Emmet for event based stream and store
- **Polling Strategy**: Unable to implement custom MutationObserver for DOM changes, so opted for controlled polling loops to monitor price updates

## Client Architecture  
- **XState/Store**: Perfect state management solution for complex real-time data flows and predictable state transitions
- **Autocomplete Integration**: Successfully integrated TradingView's endpoint for ticker symbol suggestions and validation
- **Aggressive Efficiency**: Implemented selectors for granular re-renders - each update is calculated and intentional, not reactive
- **React Query**: Maintains client-side caching and synchronization while keeping server lightweight and stateless
- **Monorepo Benefits**: Shared packages and types across client/server enabled consistent APIs and reduced duplication

## Infrastructure & Tooling
- **Turbo Monorepo**: Streamlined build system and dependency management across multiple applications
- **TSX Execution**: Fast TypeScript execution without compilation overhead during development
- **Cursor AI**: Accelerated styling implementation and automated comment generation

## Scalability Considerations
This architecture supports multiple concurrent clients and can scale horizontally with Redis (small-scale) or RabbitMQ (large-scale) message queuing. Future enhancements could include Celery-based scraping pipelines with distributed worker nodes for load management. Every architectural decision was deliberate and designed for maintainability.
