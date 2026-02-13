package controllers

import (
	"log"
	"net/http"
	"net/url"

	"github.com/mercurjs/adapter/internal/services"
)

type OAuthHandler struct {
	service  *services.OAuthService
	webUIURL string
}

func NewOAuthHandler(service *services.OAuthService, webUIURL string) *OAuthHandler {
	return &OAuthHandler{
		service:  service,
		webUIURL: webUIURL,
	}
}

// HandleCallback handles GET /oauth/callback
// Exchanges code for token, gets shop_id from token response, then redirects
func (h *OAuthHandler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")

	if code == "" {
		h.redirect(w, r, false, "", "missing authorization code")
		return
	}

	// Exchange code for token - returns shop_id from token response
	shopID, err := h.service.ExchangeCode(code)
	if err != nil {
		log.Printf("[oauth] Token exchange failed: %v", err)
		h.redirect(w, r, false, "", "token exchange failed")
		return
	}

	log.Printf("[oauth] Token stored for shop=%s", shopID)
	h.redirect(w, r, true, shopID, "")
}

func (h *OAuthHandler) redirect(w http.ResponseWriter, r *http.Request, success bool, shopID, errMsg string) {
	if h.webUIURL == "" {
		// No WebUI configured, return JSON
		w.Header().Set("Content-Type", "application/json")
		if success {
			w.Write([]byte(`{"success":true,"shop_id":"` + shopID + `"}`))
		} else {
			w.Write([]byte(`{"success":false,"error":"` + errMsg + `"}`))
		}
		return
	}

	// Redirect to WebUI
	redirectURL := h.webUIURL + "?"
	if success {
		redirectURL += "success=true&shop_id=" + url.QueryEscape(shopID)
	} else {
		redirectURL += "error=" + url.QueryEscape(errMsg)
	}

	http.Redirect(w, r, redirectURL, http.StatusFound)
}
