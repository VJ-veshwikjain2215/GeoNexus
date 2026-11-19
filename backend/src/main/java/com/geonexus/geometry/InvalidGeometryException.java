package com.geonexus.geometry;

/** Thrown when a geometry violates the storage policy. The message is safe to show to API clients. */
public class InvalidGeometryException extends IllegalArgumentException {

    public InvalidGeometryException(String message) {
        super(message);
    }
}
