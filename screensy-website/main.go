package main

import (
	"bytes"
	"fmt"
	"golang.org/x/text/language"
	"io/ioutil"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

var state = globalState{}
type globalState struct {
	fileCache    [][]byte
	matcher      language.Matcher
}

func main() {
	const port = 8080

	// This webserver only deals with very small requests; 5 seconds should be plenty
	const timeout = 5 * time.Second

	state.fileCache, state.matcher = fetchTranslations()

	server := http.Server {
		Addr: fmt.Sprintf(":%d", port),
		Handler: http.HandlerFunc(getServer(http.FileServer(http.Dir(".")))),
		ReadTimeout: timeout,
		WriteTimeout: timeout,
		IdleTimeout: timeout,
	}

	log.Printf("Server started on port %d", port)
	err := server.ListenAndServe()
	log.Fatal(err)
}

func fetchTranslations() ([][]byte, language.Matcher) {
	filePaths, err := filepath.Glob("./translations/*.html")

	if err == filepath.ErrBadPattern {
		panic("Invalid pattern during fetchTranslations")
	}

	log.Printf("Registering the following %d translation files:", len(filePaths))
	for idx, filePath := range filePaths {
		log.Printf("%3d. %s\n", idx + 1, filePath)
	}

	// Prepend "translations/en.html", because it serves as the ultimate fallback
	filePaths = append([]string{"translations/en.html"}, filePaths...)

	numTranslations := len(filePaths)
	fileNames := make([]string, numTranslations, numTranslations)
	fileCache := make([][]byte, numTranslations, numTranslations)
	languageTags := make([]language.Tag, numTranslations, numTranslations)

	for idx, filePath := range filePaths {
		fileNames[idx] = filepath.Base(filePath)
		fileCache[idx], err = ioutil.ReadFile(filePath)

		if err != nil {
			panic("Could not read localisation file " + filePath)
		}

		languageTags[idx] = language.MustParse(strings.TrimSuffix(fileNames[idx], filepath.Ext(fileNames[idx])))
	}

	return fileCache, language.NewMatcher(languageTags)
}

func getServer(fileServer http.Handler) func(writer http.ResponseWriter, request *http.Request) {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/" || request.URL.Path == "/index.html" {
			acceptLanguageHeader := request.Header.Get("Accept-Language")
			tags, _, _ := language.ParseAcceptLanguage(acceptLanguageHeader)
			_, idx, _ := state.matcher.Match(tags...)
			fileContent := state.fileCache[idx]

			http.ServeContent(writer, request, "index.html", time.Time{}, bytes.NewReader(fileContent))
		} else {
			fileServer.ServeHTTP(writer, request)
		}
	}
}
