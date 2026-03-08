# Stage 1: Build cubelib-cli from source (Codeberg latest)
FROM rust:latest AS builder

# Install nightly rust
RUN rustup install nightly && rustup default nightly

# Clone cubelib from Codeberg
RUN git clone https://codeberg.org/joba/cubelib.git /cubelib
WORKDIR /cubelib/cli

# Build release
RUN cargo build --release

# Stage 2: Run the Python server
FROM python:3.11-slim
WORKDIR /app

# Copy the built binary
COPY --from=builder /cubelib/cli/target/release/cubelib-cli /app/cubelib-cli
RUN chmod +x /app/cubelib-cli

# Copy server files
COPY api_server.py .

ENV PORT=8080
EXPOSE 8080

CMD ["python", "api_server.py"]
