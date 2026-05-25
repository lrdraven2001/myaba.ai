package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.SearchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * AI-powered cross-entity search.
 *
 * POST /api/search
 * Body: { "query": "..." }
 * Returns: { query, summary, hits: [{ type, id, title, snippet }], totalCount }
 *
 * All results are permission-filtered before reaching the AI.
 */
@RestController
@RequestMapping("/api/search")
@RequiredArgsConstructor
@Slf4j
public class SearchController {

    private final SearchService searchService;

    @PostMapping
    public ResponseEntity<Map<String, Object>> search(
            @AuthenticationPrincipal AppUser user,
            @RequestBody Map<String, String> body) {

        String query = body.getOrDefault("query", "").strip();
        log.debug("Search request from uid={} query=\"{}\"", user.getUid(), query);

        Map<String, Object> result = searchService.search(user, query);
        return ResponseEntity.ok(result);
    }
}
