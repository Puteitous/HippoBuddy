package com.example.agent.core.blocker;

import com.example.agent.progress.EditConfirmationHandler;
import com.fasterxml.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class EditConfirmationBlocker implements Blocker {

    private EditConfirmationHandler confirmationHandler;

    public void setConfirmationHandler(EditConfirmationHandler confirmationHandler) {
        this.confirmationHandler = confirmationHandler;
    }

    @Override
    public HookResult check(String toolName, JsonNode arguments) {
        if (!"edit_file".equals(toolName)) {
            return HookResult.allow();
        }

        if (confirmationHandler == null) {
            return HookResult.allow();
        }

        if (RequestContext.isWeb()) {
            return HookResult.allow();
        }

        try {
            String filePath = arguments.get("path").asText();
            String oldText = arguments.get("old_text").asText();
            String newText = arguments.get("new_text").asText();

            Path path = Path.of(filePath);
            String fileContent = Files.readString(path, StandardCharsets.UTF_8);

            if (!fileContent.contains(oldText)) {
                return HookResult.allow();
            }

            boolean confirmed = confirmationHandler.confirmEdit(filePath, oldText, newText);

            if (confirmed) {
                return HookResult.allow();
            } else {
                return HookResult.block("USER_CANCELLED");
            }

        } catch (Exception e) {
            return HookResult.allow();
        }
    }
}
