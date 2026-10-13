import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage } from '../lib/auth/messages.ts';

test('Auth errors explain recovery without leaking backend details', () => {
  for (const [error, expected] of [
    [{code:'email_not_confirmed'}, '確認がまだ完了'],
    [{code:'user_already_exists'}, '登録済み'],
    [{code:'invalid_credentials'}, '違います'],
    [{code:'email_address_invalid', message:'Invalid email'}, '形式'],
    [{code:'weak_password'}, '8文字以上'],
    [{status:429}, '送信間隔'],
    [{code:'email_address_not_authorized'}, '送信できません'],
    [new TypeError('Failed to fetch'), 'ネットワーク'],
  ]) assert.ok(authErrorMessage(error).includes(expected));
  assert.ok(!authErrorMessage(new Error('Database error saving new user: private_detail')).includes('private_detail'));
});
