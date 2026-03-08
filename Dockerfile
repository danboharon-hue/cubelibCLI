# Stage 1: Build cubelib-cli from source
FROM rust:latest AS builder

# Install nightly rust
RUN rustup install nightly && rustup default nightly

# Clone cubelib
RUN git clone https://github.com/Jobarion/cubelib.git /cubelib
WORKDIR /cubelib/cli

# Build release
RUN cargo build --release

# Debug: list output files
RUN find /cubelib -name "cubelib*" -type f 2>/dev/null || true
RUN ls -la /cubelib/target/release/ 2>/dev/null | head -20 || true
RUN ls -la /cubelib/cli/target/release/ 2>/dev/null | head -20 || true

# Stage 2: Run the Python server
FROM python:3.11-slim
WORKDIR /app

# Copy the built binary (it's in cli/target/release/)
COPY --from=builder /cubelib/cli/target/release/cubelib-cli /app/cubelib-cli
RUN chmod +x /app/cubelib-cli

# Copy server files
COPY api_server.py .
COPY index.html .

ENV PORT=8080
EXPOSE 8080

CMD ["python", "api_server.py"]
