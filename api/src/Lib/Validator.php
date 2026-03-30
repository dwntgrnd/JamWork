<?php

namespace JamWork\Lib;

use Psr\Http\Message\ResponseInterface as Response;

class Validator
{
    /**
     * Validate data against rules.
     * Rules are pipe-separated: 'required|email|min:6'
     *
     * @return array Array of {field, message} errors (empty if valid)
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];

        foreach ($rules as $field => $ruleString) {
            $ruleList = explode('|', $ruleString);
            $value = $data[$field] ?? null;

            $isOptional = in_array('optional', $ruleList);
            $isNullable = in_array('nullable', $ruleList);

            // Skip validation if optional and not present
            if ($isOptional && !array_key_exists($field, $data)) {
                continue;
            }

            // Skip validation if nullable and null
            if ($isNullable && $value === null) {
                continue;
            }

            foreach ($ruleList as $rule) {
                if ($rule === 'optional' || $rule === 'nullable') {
                    continue;
                }

                $error = self::applyRule($field, $value, $rule, $data);
                if ($error !== null) {
                    $errors[] = $error;
                    break; // One error per field
                }
            }
        }

        return $errors;
    }

    /**
     * Return a 400 response with validation errors.
     */
    public static function respondWithErrors(Response $response, array $errors): Response
    {
        $payload = json_encode(['errors' => $errors]);
        $response->getBody()->write($payload);
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(400);
    }

    private static function applyRule(string $field, mixed $value, string $rule, array $data): ?array
    {
        // Rules with parameters
        if (str_contains($rule, ':')) {
            [$ruleName, $param] = explode(':', $rule, 2);
        } else {
            $ruleName = $rule;
            $param = null;
        }

        return match ($ruleName) {
            'required' => self::ruleRequired($field, $value),
            'email' => self::ruleEmail($field, $value),
            'min' => self::ruleMin($field, $value, (int) $param),
            'max' => self::ruleMax($field, $value, (int) $param),
            'in' => self::ruleIn($field, $value, $param),
            'uuid' => self::ruleUuid($field, $value),
            'iso8601' => self::ruleIso8601($field, $value),
            'boolean' => self::ruleBoolean($field, $value),
            'array' => self::ruleArray($field, $value),
            'url' => self::ruleUrl($field, $value),
            'hex_color' => self::ruleHexColor($field, $value),
            'uuid_array' => self::ruleUuidArray($field, $value),
            default => null,
        };
    }

    private static function ruleRequired(string $field, mixed $value): ?array
    {
        if ($value === null || $value === '') {
            return ['field' => $field, 'message' => "{$field} is required"];
        }
        return null;
    }

    private static function ruleEmail(string $field, mixed $value): ?array
    {
        if ($value !== null && $value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            return ['field' => $field, 'message' => "{$field} must be a valid email address"];
        }
        return null;
    }

    private static function ruleMin(string $field, mixed $value, int $min): ?array
    {
        if (is_string($value) && mb_strlen($value) < $min) {
            return ['field' => $field, 'message' => "{$field} must be at least {$min} characters"];
        }
        return null;
    }

    private static function ruleMax(string $field, mixed $value, int $max): ?array
    {
        if (is_string($value) && mb_strlen($value) > $max) {
            return ['field' => $field, 'message' => "{$field} must be at most {$max} characters"];
        }
        return null;
    }

    private static function ruleIn(string $field, mixed $value, string $options): ?array
    {
        $allowed = explode(',', $options);
        if ($value !== null && $value !== '' && !in_array($value, $allowed, true)) {
            return ['field' => $field, 'message' => "{$field} must be one of: {$options}"];
        }
        return null;
    }

    private static function ruleUuid(string $field, mixed $value): ?array
    {
        $pattern = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';
        if ($value !== null && $value !== '' && !preg_match($pattern, $value)) {
            return ['field' => $field, 'message' => "{$field} must be a valid UUID"];
        }
        return null;
    }

    private static function ruleIso8601(string $field, mixed $value): ?array
    {
        if ($value !== null && $value !== '') {
            $dt = \DateTimeImmutable::createFromFormat(\DateTimeInterface::ATOM, $value)
                ?: \DateTimeImmutable::createFromFormat('Y-m-d\TH:i:s.uP', $value)
                ?: \DateTimeImmutable::createFromFormat('Y-m-d', $value);
            if ($dt === false) {
                return ['field' => $field, 'message' => "{$field} must be a valid ISO 8601 date"];
            }
        }
        return null;
    }

    private static function ruleBoolean(string $field, mixed $value): ?array
    {
        if ($value !== null && !is_bool($value) && $value !== 0 && $value !== 1) {
            return ['field' => $field, 'message' => "{$field} must be a boolean"];
        }
        return null;
    }

    private static function ruleArray(string $field, mixed $value): ?array
    {
        if ($value !== null && !is_array($value)) {
            return ['field' => $field, 'message' => "{$field} must be an array"];
        }
        return null;
    }

    private static function ruleUrl(string $field, mixed $value): ?array
    {
        if ($value !== null && $value !== '' && !filter_var($value, FILTER_VALIDATE_URL)) {
            return ['field' => $field, 'message' => "{$field} must be a valid URL"];
        }
        return null;
    }

    private static function ruleHexColor(string $field, mixed $value): ?array
    {
        if ($value !== null && $value !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
            return ['field' => $field, 'message' => "{$field} must be a valid hex color"];
        }
        return null;
    }

    /**
     * Convert an ISO 8601 date string to MySQL TIMESTAMP format.
     * Returns null if input is null.
     */
    public static function toMySQLDate(?string $isoDate): ?string
    {
        if ($isoDate === null) {
            return null;
        }
        $dt = \DateTimeImmutable::createFromFormat(\DateTimeInterface::ATOM, $isoDate)
            ?: \DateTimeImmutable::createFromFormat('Y-m-d\TH:i:s.uP', $isoDate)
            ?: \DateTimeImmutable::createFromFormat('Y-m-d', $isoDate);
        if ($dt === false) {
            throw new \InvalidArgumentException("Cannot parse date: {$isoDate}");
        }
        return $dt->format('Y-m-d H:i:s');
    }

    private static function ruleUuidArray(string $field, mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        if (!is_array($value)) {
            return ['field' => $field, 'message' => "{$field} must be an array of UUIDs"];
        }
        $pattern = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';
        foreach ($value as $item) {
            if (!is_string($item) || !preg_match($pattern, $item)) {
                return ['field' => $field, 'message' => "{$field} must contain only valid UUIDs"];
            }
        }
        return null;
    }
}
