package main

import (
	"fmt"
	"golang.org/x/text/language"
	"golang.org/x/text/language/display"
	"log"
	"net/http"
)

func main() {
	const port = 80

	server := &http.Server {
		Addr: fmt.Sprintf(":%d", port),
		Handler: http.HandlerFunc(Serve),
	}

	log.Printf("Server started on port %d", port)
	err := server.ListenAndServe()
	log.Fatal(err)
}

func Serve(writer http.ResponseWriter, request *http.Request) {
	if request.URL.Path == "/" || request.URL.Path == "/index.html" {
		acceptLanguageHeader := request.Header.Get("Accept-Language")
		localizedIndexPath := GetLocalizedIndexPath(acceptLanguageHeader)

		http.ServeFile(writer, request, localizedIndexPath)
	} else {
		directory := http.Dir(".")
		fileServer := http.FileServer(directory)

		fileServer.ServeHTTP(writer, request)
	}
}

func GetLocalizedIndexPath(acceptLanguageHeader string) string {
	matcher := language.NewMatcher([]language.Tag{
		language.BritishEnglish, // Fallback in case no match is found
	})

	tags, _, _ := language.ParseAcceptLanguage(acceptLanguageHeader)
	tag, _, _ := matcher.Match(tags...)
	languageName := display.English.Languages().Name(tag)

	switch languageName {
	default:
		return "index.html"
	}
}