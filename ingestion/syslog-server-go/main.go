package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gopkg.in/mcuadros/go-syslog.v2"
)

const (
	INGESTION_API_URL = "http://ingestion-api:8000/ingest"
	HTTP_TIMEOUT      = 5 * time.Second
	BATCH_SIZE        = 50
	FLUSH_INTERVAL    = 1 * time.Second
)

// ANSI color codes for terminal output
const (
	ColorGreen  = "\033[92m"
	ColorYellow = "\033[93m"
	ColorRed    = "\033[91m"
	ColorCyan   = "\033[36m"
	ColorReset  = "\033[0m"
)

// logInfo prints an info message with timestamp and emoji
func logInfo(emoji, message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	fmt.Printf("[%s] [INFO] %s %s%s%s\n", timestamp, emoji, ColorGreen, message, ColorReset)
}

// logError prints an error message with timestamp and emoji
func logError(message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	fmt.Printf("[%s] [ERROR] %s %s%s%s\n", timestamp, "✗", ColorRed, message, ColorReset)
}

// logWarn prints a warning message with timestamp and emoji
func logWarn(message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	fmt.Printf("[%s] [WARN] %s %s%s%s\n", timestamp, "⚠", ColorYellow, message, ColorReset)
}

// ParsedLog represents a normalized log ready to send to the ingestion API
type ParsedLog struct {
	Timestamp string                 `json:"timestamp"`
	Source    string                 `json:"source"`
	Host      string                 `json:"host"`
	User      string                 `json:"user"`
	IP        string                 `json:"ip"`
	EventType string                 `json:"event_type"`
	Severity  string                 `json:"severity"`
	Raw       map[string]interface{} `json:"raw"`
}

// forwardBatchToAPI sends a batch of parsed logs to the ingestion API
func forwardBatchToAPI(logs []*ParsedLog) error {
	client := &http.Client{Timeout: HTTP_TIMEOUT}
	
	payload, err := json.Marshal(logs)
	if err != nil {
		return fmt.Errorf("failed to marshal log: %w", err)
	}

	resp, err := client.Post(INGESTION_API_URL, "application/json", bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to forward log to API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// normalizeLogParts converts syslog parsed parts to normalized schema
func normalizeLogParts(logParts map[string]interface{}) *ParsedLog {
	// Extract common syslog fields
	hostname := "unknown"
	if h, ok := logParts["hostname"].(string); ok {
		hostname = h
	}

	tag := "unknown"
	if t, ok := logParts["tag"].(string); ok {
		tag = t
	}

	message := ""
	if m, ok := logParts["message"].(string); ok {
		message = m
	}

	timestamp := time.Now().UTC().Format(time.RFC3339)
	if ts, ok := logParts["timestamp"].(time.Time); ok {
		timestamp = ts.UTC().Format(time.RFC3339)
	}

	// Build normalized log
	return &ParsedLog{
		Timestamp: timestamp,
		Source:    "syslog",
		Host:      hostname,
		User:      "syslog",
		IP:        "0.0.0.0", // Will be extracted from TCP connection if available
		EventType: "syslog_event",
		Severity:  "low",
		Raw: map[string]interface{}{
			"tag":     tag,
			"message": message,
			"parts":   logParts,
		},
	}
}

func main() {
	channel := make(syslog.LogPartsChannel)
	handler := syslog.NewChannelHandler(channel)

	server := syslog.NewServer()
	server.SetFormat(syslog.RFC5424)
	server.SetHandler(handler)
	err := server.ListenUDP("0.0.0.0:514")
	if err != nil {
		logError(fmt.Sprintf("Failed to listen for UDP syslog: %v", err))
		os.Exit(1)
	}

	err = server.Boot()
	if err != nil {
		logError(fmt.Sprintf("Failed to boot syslog server: %v", err))
		os.Exit(1)
	}

	logInfo("📨", "Syslog Server Started on port 514 (RFC5424)")
	logInfo("→", fmt.Sprintf("Forwarding logs to: %s", INGESTION_API_URL))

	go func(channel syslog.LogPartsChannel) {
		buffer := make([]*ParsedLog, 0, BATCH_SIZE)
		ticker := time.NewTicker(FLUSH_INTERVAL)
		defer ticker.Stop()

		flush := func() {
			if len(buffer) == 0 {
				return
			}
			if err := forwardBatchToAPI(buffer); err != nil {
				logError(fmt.Sprintf("Failed to forward batch of %d logs: %v", len(buffer), err))
			} else {
				logInfo("✓", fmt.Sprintf("Forwarded batch of %d logs", len(buffer)))
			}
			buffer = buffer[:0]
		}

		for {
			select {
			case logParts, ok := <-channel:
				if !ok {
					flush()
					return
				}
				buffer = append(buffer, normalizeLogParts(logParts))
				if len(buffer) >= BATCH_SIZE {
					flush()
				}
			case <-ticker.C:
				flush()
			}
		}
	}(channel)

	// Wait for a shutdown signal
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs

	logInfo("🛑", "Shutting down syslog server...")
	server.Kill()
}
