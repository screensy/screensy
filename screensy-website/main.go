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

type globalState struct {
	fileNames    []string
	fileCache    [][]byte
	languageTags []language.Tag
	matcher      language.Matcher
}

var state = globalState{}

func main() {
	state.fileNames, state.fileCache, state.languageTags, state.matcher = fetchTranslations()

	log.Printf("Registered the following %d translation files:", len(state.fileNames))
	for idx, fileName := range state.fileNames {
		log.Printf("%3d. %s\n", idx, fileName)
	}

	// Run the webserver on the default HTTP port 80
	const port = 80

	// This webserver only deals with very small requests; 5 seconds should be plenty
	const timeout = 5 * time.Second

	server := http.Server {
		Addr: fmt.Sprintf(":%d", port),
		Handler: http.HandlerFunc(server(http.FileServer(http.Dir(".")))),
		ReadTimeout: timeout,
		WriteTimeout: timeout,
		IdleTimeout: timeout,
	}

	log.Printf("Server started on port %d", port)
	err := server.ListenAndServe()
	log.Fatal(err)
}

func fetchTranslations() ([]string, [][]byte, []language.Tag, language.Matcher) {
	filePaths, err := filepath.Glob("./translations/*.html")

	if err == filepath.ErrBadPattern {
		panic("Invalid pattern during fetchTranslations")
	}

	numTranslations := len(filePaths)

	fileNames := make([]string, numTranslations, numTranslations)
	fileCache := make([][]byte, numTranslations, numTranslations)
	languageTags := make([]language.Tag, numTranslations, numTranslations)

	for idx, filePath := range filePaths {
		fileNames[idx] = filepath.Base(filePath)
		fileContent, err := ioutil.ReadFile(filePath)

		if err != nil {
			panic("Could not read localisation file " + filePath)
		}

		fileCache[idx] = fileContent

		languageCode := strings.TrimSuffix(fileNames[idx], filepath.Ext(fileNames[idx]))
		languageTags[idx] = language.MustParse(languageCode)
	}

	matcher := language.NewMatcher(languageTags)

	return fileNames, fileCache, languageTags, matcher
}

func server(fileServer http.Handler) func(writer http.ResponseWriter, request *http.Request) {
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
