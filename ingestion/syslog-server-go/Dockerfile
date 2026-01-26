# Stage 1: Build the Go binary
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY ingestion/syslog-server-go/go.mod ingestion/syslog-server-go/go.sum ./
COPY ingestion/syslog-server-go/main.go .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /syslog-server .

# Stage 2: Create the final, smaller image
FROM alpine:latest

# Copy the pre-built binary from the builder stage
COPY --from=builder /syslog-server /

# Expose port 514 for UDP
EXPOSE 514/udp

# Command to run the executable
CMD ["/syslog-server"]
