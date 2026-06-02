<?php

namespace Tests;

use PHPUnit\Framework\TestCase;
use JamWork\Lib\Validator;

/**
 * Pure-logic tests for the Validator (audit §4.4 consolidation).
 * Covers the centralized UUID helper, numeric `in:` matching, and the
 * `error`-key addition to respondWithErrors. No DB, no network.
 */
final class ValidatorTest extends TestCase
{
    private const UUID = '11111111-1111-1111-1111-111111111111';

    public function testIsUuidAcceptsValidAndRejectsEverythingElse(): void
    {
        $this->assertTrue(Validator::isUuid(self::UUID));
        $this->assertFalse(Validator::isUuid('not-a-uuid'));
        $this->assertFalse(Validator::isUuid(''));
        $this->assertFalse(Validator::isUuid(12345));
        $this->assertFalse(Validator::isUuid(null));
        $this->assertFalse(Validator::isUuid([self::UUID]));
    }

    public function testInRuleMatchesNumericEnums(): void // effort: in:1,2,4,8
    {
        $rules = ['effort' => 'in:1,2,4,8'];

        $this->assertSame([], Validator::validate(['effort' => 4], $rules));     // JSON number
        $this->assertSame([], Validator::validate(['effort' => '8'], $rules));   // string
        $this->assertNotEmpty(Validator::validate(['effort' => 3], $rules));
    }

    public function testInRuleStillMatchesStringEnums(): void
    {
        $rules = ['status' => 'in:todo,in_progress,blocked,review,done'];

        $this->assertSame([], Validator::validate(['status' => 'review'], $rules));
        $this->assertNotEmpty(Validator::validate(['status' => 'nope'], $rules));
    }

    public function testNullableUuidRule(): void // bulk-update sprintId
    {
        $rules = ['sprintId' => 'nullable|uuid'];

        $this->assertSame([], Validator::validate(['sprintId' => null], $rules));
        $this->assertSame([], Validator::validate(['sprintId' => self::UUID], $rules));
        $this->assertSame([], Validator::validate([], $rules));
        $this->assertNotEmpty(Validator::validate(['sprintId' => 'bad'], $rules));
    }

    public function testUuidArrayUsesCentralizedCheck(): void
    {
        $rules = ['ids' => 'uuid_array'];

        $this->assertSame([], Validator::validate(['ids' => [self::UUID, self::UUID]], $rules));
        $this->assertNotEmpty(Validator::validate(['ids' => [self::UUID, 'bad']], $rules));
        $this->assertNotEmpty(Validator::validate(['ids' => 'not-an-array'], $rules));
    }

    public function testRespondWithErrorsIncludesTopLevelErrorKey(): void
    {
        $factory = new \Slim\Psr7\Factory\ResponseFactory();
        $errors = Validator::validate(['status' => 'bogus'], ['status' => 'in:todo,done']);

        $response = Validator::respondWithErrors($factory->createResponse(), $errors);
        $payload = json_decode((string) $response->getBody(), true);

        $this->assertSame(400, $response->getStatusCode());
        $this->assertArrayHasKey('error', $payload);   // surfaced to generic clients
        $this->assertArrayHasKey('errors', $payload);  // full field detail retained
        $this->assertSame($errors[0]['message'], $payload['error']);
    }
}
