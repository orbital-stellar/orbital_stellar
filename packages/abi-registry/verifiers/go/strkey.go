package attestverify

import (
	"encoding/base32"
	"errors"
)

// accountVersionByte is the strkey version byte of an ed25519 account
// address ("G..."): 6 << 3.
const accountVersionByte = 6 << 3

var errBadAddress = errors.New("not a valid Stellar account address")

// publicKeyFromAddress decodes a "G..." address to its 32-byte ed25519 key,
// checking the version byte and the CRC16-XModem checksum.
func publicKeyFromAddress(address string) ([]byte, error) {
	if len(address) != 56 {
		return nil, errBadAddress
	}
	raw, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(address)
	if err != nil || len(raw) != 35 || raw[0] != accountVersionByte {
		return nil, errBadAddress
	}
	payload, checksum := raw[:33], raw[33:]
	sum := crc16XModem(payload)
	// The checksum is stored little-endian.
	if checksum[0] != byte(sum) || checksum[1] != byte(sum>>8) {
		return nil, errBadAddress
	}
	return raw[1:33], nil
}

func crc16XModem(data []byte) uint16 {
	var crc uint16
	for _, b := range data {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if crc&0x8000 != 0 {
				crc = crc<<1 ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}
