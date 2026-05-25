package ai.myaba.config;

import ai.myaba.service.PolicyRagService;
import ai.myaba.service.PolicyService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;

/**
 * Wires cross-service dependencies that would cause circular injection
 * if done through constructor injection alone.
 *
 * PolicyService ← PolicyRagService (indexPolicy called on policy writes)
 * PolicyRagService → PolicyService (getPoliciesForContext called at retrieval)
 *
 * Breaking the cycle: PolicyService holds a @Setter field for PolicyRagService;
 * this config class calls the setter after both beans are fully constructed.
 */
@Configuration
@RequiredArgsConstructor
public class ServiceWiringConfig {

    private final PolicyService policyService;
    private final PolicyRagService policyRagService;

    @PostConstruct
    void wire() {
        policyService.setPolicyRagService(policyRagService);
        // Index dev-seeded policies now that the RAG service is wired in
        policyService.indexSeedPolicies();
    }
}
