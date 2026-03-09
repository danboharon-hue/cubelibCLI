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

# Pre-generate pruning tables during build
RUN mkdir -p /root/.cubelib/tables/333
RUN /app/cubelib-cli --no-check-update solve -q 100 -n 1 -f plain -s "EO>DR>HTR>FIN" "R U R' U'" || true
RUN /app/cubelib-cli --no-check-update solve -q 100 -n 1 -f plain -s "EO>DR>HTR>FINLS>VR>FIN" "R U R' U'" || true
RUN /app/cubelib-cli --no-check-update solve -q 100 -n 1 -f plain -s "EO>DR>HTR>FRLS>FINLS" "R U R' U'" || true
RUN ls -la /root/.cubelib/tables/333/

# Copy server files
COPY api_server.py .

ENV PORT=8080
EXPOSE 8080

CMD ["python", "api_server.py"]
