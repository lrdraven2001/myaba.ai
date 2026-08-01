package ai.myaba.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Dedicated executor for heavy document extraction (@Async("extractionExecutor")).
 *
 * <p>Without this, extraction jobs (OCR / vision / PDF + Office parsing) run on
 * Spring Boot's shared {@code applicationTaskExecutor}, where a burst of large
 * uploads can occupy every thread and starve other async work (audit writes,
 * notifications). This bounded pool isolates extraction so request-serving async
 * work stays responsive, and its queue provides backpressure instead of
 * unbounded thread growth.
 *
 * <p>Sized for the Cloud Run container running extraction with
 * {@code cpu-throttling=false}; tune via the constants if the instance size changes.
 */
@Configuration
public class AsyncConfig {

    @Bean("extractionExecutor")
    public TaskExecutor extractionExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(2);
        ex.setMaxPoolSize(4);
        ex.setQueueCapacity(100);
        ex.setThreadNamePrefix("extraction-");
        // Under sustained overload, run the task on the caller's thread rather than
        // dropping it — extraction must not be silently lost.
        ex.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        ex.initialize();
        return ex;
    }
}
