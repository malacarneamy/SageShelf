<?php
// backend/presenters/ShelfPresenter.php

class ShelfPresenter {
    private ShelfModel $model;

    public function __construct() {
        $this->model = new ShelfModel();
    }

    public function getAll(int $userId): array {
        return ['shelves' => $this->model->getAll($userId)];
    }

    public function create(int $userId, array $body): array {
        $name = trim($body['name'] ?? '');
        if (!$name) respondError('Nome scaffale obbligatorio');
        $id = $this->model->create($userId, $name);
        return ['shelf' => $this->model->findById($id, $userId)];
    }

    public function update(int $userId, int $id, array $body): array {
        $name = trim($body['name'] ?? '');
        if (!$name) respondError('Nome scaffale obbligatorio');
        $ok = $this->model->update($id, $userId, $name);
        if (!$ok) respondError('Scaffale non trovato', 404);
        return ['shelf' => $this->model->findById($id, $userId)];
    }

    public function delete(int $userId, int $id): array {
        $ok = $this->model->delete($id, $userId);
        if (!$ok) respondError('Scaffale non trovato', 404);
        return ['deleted' => true];
    }

    public function reorder(int $userId, array $body): array {
        $ids = $body['ids'] ?? [];
        if (empty($ids)) respondError('ids obbligatorio');
        $this->model->reorder($userId, $ids);
        return ['shelves' => $this->model->getAll($userId)];
    }

    public function updateSort(int $userId, int $shelfId, array $body): array {
        $sortBy  = $body['sort_by'] ?? 'added_desc';
        $allowed = ['title', 'author', 'added_asc', 'added_desc', 'custom'];
        if (!in_array($sortBy, $allowed)) respondError('Criterio non valido');
        $this->model->updateSortBy($shelfId, $userId, $sortBy);
        return ['updated' => true];
    }

    public function updateAllSort(int $userId, array $body): array {
        $sortBy  = $body['sort_by'] ?? 'added_desc';
        $allowed = ['title', 'author', 'added_asc', 'added_desc', 'custom'];
        if (!in_array($sortBy, $allowed)) respondError('Criterio non valido');
        (new UserModel())->updateAllSortBy($userId, $sortBy);
        return ['updated' => true];
    }
}