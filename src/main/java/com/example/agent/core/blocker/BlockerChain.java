package com.example.agent.core.blocker;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class BlockerChain implements Blocker {

    private static final Logger logger = LoggerFactory.getLogger(BlockerChain.class);

    private final List<Blocker> blockers = new ArrayList<>();

    public BlockerChain add(Blocker blocker) {
        blockers.add(blocker);
        return this;
    }

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        HookResult lastWarning = null;

        for (Blocker blocker : blockers) {
            HookResult result = Objects.requireNonNull(
                blocker.check(toolName, arguments),
                "Blocker " + blocker.getClass().getSimpleName() + " returned null"
            );

            if (result.isWarning()) {
                logger.info("BLOCKER WARN from {} for tool={}: {}",
                    blocker.getClass().getSimpleName(), toolName, result.getReason());
                lastWarning = result;
                continue;
            }

            if (!result.isAllowed()) {
                String argsSummary = arguments != null
                    ? arguments.toString().substring(0, Math.min(100, arguments.toString().length()))
                    : "null";
                logger.info("BLOCKED by {} for tool={}, args={}",
                    blocker.getClass().getSimpleName(),
                    toolName,
                    argsSummary);
                return result;
            }
        }

        if (lastWarning != null) {
            return lastWarning;
        }

        return HookResult.allow();
    }

    public List<Blocker> getBlockers() {
        return new ArrayList<>(blockers);
    }
}
