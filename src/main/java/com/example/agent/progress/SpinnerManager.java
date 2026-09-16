package com.example.agent.progress;

import java.util.ArrayList;
import java.util.List;

public class SpinnerManager {

    private static final SpinnerManager INSTANCE = new SpinnerManager();
    private final List<ToolCallCard> activeCards = new ArrayList<>();

    private SpinnerManager() {
    }

    public static SpinnerManager getInstance() {
        return INSTANCE;
    }

    public void registerCard(ToolCallCard card) {
        synchronized (activeCards) {
            activeCards.add(card);
        }
    }

    public void unregisterCard(ToolCallCard card) {
        synchronized (activeCards) {
            activeCards.remove(card);
        }
    }

    public void pauseAll() {
    }

    public void resumeAll() {
    }

    public void clear() {
        synchronized (activeCards) {
            activeCards.clear();
        }
    }
}
