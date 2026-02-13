package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port          string
	Host          string
	WebhookSecret string
	WebUIURL      string
	Broker        BrokerConfig
	Database      DatabaseConfig
	MercurJS      MercurJSConfig
}

type MercurJSConfig struct {
	BaseURL      string
	ClientID     string
	ClientSecret string
	RedirectURI  string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

func (c *DatabaseConfig) ConnectionString() string {
	return "host=" + c.Host +
		" port=" + c.Port +
		" user=" + c.User +
		" password=" + c.Password +
		" dbname=" + c.Name +
		" sslmode=" + c.SSLMode
}

type BrokerConfig struct {
	URL      string
	ClientID string
	Username string
	Password string
}

func Load() *Config {
	godotenv.Load()

	return &Config{
		Port:          getEnv("PORT", "3001"),
		Host:          getEnv("HOST", "0.0.0.0"),
		WebhookSecret: getEnv("WEBHOOK_SECRET", ""),
		WebUIURL:      getEnv("WEBUI_URL", ""),
		Broker: BrokerConfig{
			URL:      getEnv("BROKER_URL", "tcp://localhost:1883"),
			ClientID: getEnv("BROKER_CLIENT_ID", "adapter-001"),
			Username: getEnv("BROKER_USERNAME", ""),
			Password: getEnv("BROKER_PASSWORD", ""),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DATABASE_HOST", "localhost"),
			Port:     getEnv("DATABASE_PORT", "5432"),
			User:     getEnv("DATABASE_USER", "adapter"),
			Password: getEnv("DATABASE_PASSWORD", "adapter"),
			Name:     getEnv("DATABASE_NAME", "adapter"),
			SSLMode:  getEnv("DATABASE_SSLMODE", "disable"),
		},
		MercurJS: MercurJSConfig{
			BaseURL:      getEnv("MERCURJS_URL", "http://localhost:9000"),
			ClientID:     getEnv("MERCURJS_CLIENT_ID", ""),
			ClientSecret: getEnv("MERCURJS_CLIENT_SECRET", ""),
			RedirectURI:  getEnv("MERCURJS_REDIRECT_URI", "http://localhost:3001/oauth/callback"),
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
